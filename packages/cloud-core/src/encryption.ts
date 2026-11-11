import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface GeneratedDataKey {
  plaintextKey: Buffer;
  wrappedKey: string;
  keyVersion: string;
}

/**
 * Provider boundary for envelope encryption.
 *
 * Implementations must use authenticated cloud identity, enforce tenant/context
 * binding at the KMS key policy or encryption-context layer, and never persist or
 * log plaintext data keys. No local/static-key fallback is permitted.
 */
export interface TenantKeyManagementService {
  generateDataKey(tenantId: string, context: string): Promise<GeneratedDataKey>;
  unwrapDataKey(
    tenantId: string,
    wrappedKey: string,
    keyVersion: string,
    context: string
  ): Promise<Buffer>;
}

export interface EncryptedEnvelope {
  algorithm: 'A256GCM';
  keyVersion: string;
  wrappedKey: string;
  iv: string;
  authTag: string;
  ciphertext: string;
  tenantId: string;
  context: string;
}

const MAX_WRAPPED_KEY_LENGTH = 4096;
const MAX_KEY_VERSION_LENGTH = 128;
const MAX_CIPHERTEXT_LENGTH = 1_000_000;

function associatedData(tenantId: string, context: string, keyVersion: string): Buffer {
  if (!tenantId || !context || tenantId.length > 128 || context.length > 256) {
    throw new Error('Invalid encryption context');
  }
  if (!keyVersion || keyVersion.length > MAX_KEY_VERSION_LENGTH) {
    throw new Error('Invalid KMS key version');
  }
  return Buffer.from(`careerops:v1|${tenantId}|${context}|${keyVersion}`, 'utf8');
}

function decodeCanonicalBase64(value: string, label: string, maxLength: number): Buffer {
  if (
    !value ||
    value.length > maxLength ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value)
  ) {
    throw new Error(`Invalid encrypted envelope ${label}`);
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) {
    throw new Error(`Invalid encrypted envelope ${label}`);
  }
  return decoded;
}

function validateEnvelope(
  envelope: EncryptedEnvelope,
  expectedTenantId: string,
  expectedContext: string
): { iv: Buffer; authTag: Buffer; ciphertext: Buffer } {
  if (
    !envelope ||
    envelope.algorithm !== 'A256GCM' ||
    envelope.tenantId !== expectedTenantId ||
    envelope.context !== expectedContext
  ) {
    throw new Error('Encrypted envelope tenant or context mismatch');
  }
  if (
    !envelope.wrappedKey ||
    envelope.wrappedKey.length > MAX_WRAPPED_KEY_LENGTH ||
    !envelope.keyVersion ||
    envelope.keyVersion.length > MAX_KEY_VERSION_LENGTH
  ) {
    throw new Error('Invalid encrypted envelope key metadata');
  }
  associatedData(expectedTenantId, expectedContext, envelope.keyVersion);
  const iv = decodeCanonicalBase64(envelope.iv, 'IV', 16);
  const authTag = decodeCanonicalBase64(envelope.authTag, 'authentication tag', 24);
  const ciphertext = decodeCanonicalBase64(
    envelope.ciphertext,
    'ciphertext',
    MAX_CIPHERTEXT_LENGTH
  );
  if (iv.length !== 12 || authTag.length !== 16 || ciphertext.length === 0) {
    throw new Error('Invalid encrypted envelope cryptographic fields');
  }
  return { iv, authTag, ciphertext };
}

export class TenantEnvelopeCipher {
  constructor(private readonly kms: TenantKeyManagementService) {}

  async encrypt(tenantId: string, context: string, plaintext: Buffer): Promise<EncryptedEnvelope> {
    associatedData(tenantId, context, 'validation');
    if (!Buffer.isBuffer(plaintext) || plaintext.length === 0) {
      throw new Error('Plaintext must be a non-empty Buffer');
    }
    const generated = await this.kms.generateDataKey(tenantId, context);
    if (
      !Buffer.isBuffer(generated?.plaintextKey) ||
      generated.plaintextKey.length !== 32 ||
      !generated.wrappedKey ||
      generated.wrappedKey.length > MAX_WRAPPED_KEY_LENGTH ||
      !generated.keyVersion ||
      generated.keyVersion.length > MAX_KEY_VERSION_LENGTH
    ) {
      if (Buffer.isBuffer(generated?.plaintextKey)) generated.plaintextKey.fill(0);
      throw new Error('KMS returned an invalid data key');
    }
    const iv = randomBytes(12);
    try {
      const cipher = createCipheriv('aes-256-gcm', generated.plaintextKey, iv);
      cipher.setAAD(associatedData(tenantId, context, generated.keyVersion));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const envelope: EncryptedEnvelope = {
        algorithm: 'A256GCM',
        keyVersion: generated.keyVersion,
        wrappedKey: generated.wrappedKey,
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        tenantId,
        context,
      };
      validateEnvelope(envelope, tenantId, context);
      return envelope;
    } finally {
      generated.plaintextKey.fill(0);
    }
  }

  async verify(
    envelope: EncryptedEnvelope,
    expectedTenantId: string,
    expectedContext: string
  ): Promise<void> {
    const plaintext = await this.decrypt(envelope, expectedTenantId, expectedContext);
    plaintext.fill(0);
  }

  async decrypt(
    envelope: EncryptedEnvelope,
    expectedTenantId: string,
    expectedContext: string
  ): Promise<Buffer> {
    const { iv, authTag, ciphertext } = validateEnvelope(
      envelope,
      expectedTenantId,
      expectedContext
    );
    const key = await this.kms.unwrapDataKey(
      expectedTenantId,
      envelope.wrappedKey,
      envelope.keyVersion,
      expectedContext
    );
    if (!Buffer.isBuffer(key) || key.length !== 32) {
      if (Buffer.isBuffer(key)) key.fill(0);
      throw new Error('KMS returned an invalid unwrapped key');
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAAD(associatedData(expectedTenantId, expectedContext, envelope.keyVersion));
      decipher.setAuthTag(authTag);
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    } finally {
      key.fill(0);
    }
  }
}
