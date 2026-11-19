import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface GeneratedDataKey {
  plaintextKey: Buffer;
  wrappedKey: string;
  keyVersion: string;
}

export interface TenantKeyProvider {
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

const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const KEY_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;

function zeroizeBytes(value: unknown): void {
  if (value instanceof Uint8Array) value.fill(0);
}

function decodeCanonicalBase64(
  value: string,
  label: string,
  expectedLength?: number,
  maxLength = 1_400_000
): Buffer {
  if (
    typeof value !== 'string' ||
    value.length > maxLength ||
    !BASE64_PATTERN.test(value)
  ) {
    throw new Error(`Invalid base64 encoding for encrypted envelope ${label}`);
  }
  const decoded = Buffer.from(value, 'base64');
  if (
    decoded.toString('base64') !== value ||
    (expectedLength !== undefined && decoded.length !== expectedLength)
  ) {
    zeroizeBytes(decoded);
    throw new Error(`Invalid encrypted envelope ${label}`);
  }
  return decoded;
}

function associatedData(tenantId: string, context: string, keyVersion: string): Buffer {
  if (
    typeof tenantId !== 'string' ||
    !tenantId ||
    tenantId.length > 128 ||
    !/^[A-Za-z0-9._:@/-]+$/.test(tenantId) ||
    typeof context !== 'string' ||
    !context ||
    context.length > 256 ||
    !/^[A-Za-z0-9._:@/-]+$/.test(context) ||
    typeof keyVersion !== 'string' ||
    !KEY_VERSION_PATTERN.test(keyVersion)
  ) {
    throw new Error('Invalid encryption context');
  }
  return Buffer.from(`careerops:v1|${tenantId}|${context}|${keyVersion}`, 'utf8');
}

function validateEnvelope(
  envelope: EncryptedEnvelope,
  expectedTenantId: string,
  expectedContext: string
): { iv: Buffer; authTag: Buffer; ciphertext: Buffer } {
  if (
    !envelope ||
    typeof envelope !== 'object' ||
    envelope.algorithm !== 'A256GCM' ||
    envelope.tenantId !== expectedTenantId ||
    envelope.context !== expectedContext ||
    typeof envelope.wrappedKey !== 'string' ||
    envelope.wrappedKey.length === 0 ||
    envelope.wrappedKey.length > 16_384
  ) {
    throw new Error('Encrypted envelope tenant, context, or format mismatch');
  }

  // Validate the same context constraints used when authenticating AAD before
  // invoking a key provider. This prevents malformed persisted data reaching it.
  const validationAad = associatedData(expectedTenantId, expectedContext, envelope.keyVersion);
  zeroizeBytes(validationAad);

  let iv: Buffer | undefined;
  let authTag: Buffer | undefined;
  let ciphertext: Buffer | undefined;
  try {
    iv = decodeCanonicalBase64(envelope.iv, 'IV', 12, 32);
    authTag = decodeCanonicalBase64(envelope.authTag, 'authentication tag', 16, 32);
    ciphertext = decodeCanonicalBase64(envelope.ciphertext, 'ciphertext');
    return { iv, authTag, ciphertext };
  } catch (error) {
    zeroizeBytes(iv);
    zeroizeBytes(authTag);
    zeroizeBytes(ciphertext);
    throw error;
  }
}

export class TenantEnvelopeCipher {
  constructor(private readonly keyProvider: TenantKeyProvider) {}

  async encrypt(tenantId: string, context: string, plaintext: Buffer): Promise<EncryptedEnvelope> {
    if (!Buffer.isBuffer(plaintext)) throw new Error('Plaintext must be a Buffer');
    const generated = await this.keyProvider.generateDataKey(tenantId, context);
    if (
      !generated ||
      !Buffer.isBuffer(generated.plaintextKey) ||
      generated.plaintextKey.length !== 32 ||
      typeof generated.wrappedKey !== 'string' ||
      !generated.wrappedKey ||
      generated.wrappedKey.length > 16_384 ||
      typeof generated.keyVersion !== 'string' ||
      !KEY_VERSION_PATTERN.test(generated.keyVersion)
    ) {
      zeroizeBytes(generated?.plaintextKey);
      throw new Error('Key provider returned an invalid data key');
    }
    let iv: Buffer | undefined;
    let aad: Buffer | undefined;
    let ciphertext: Buffer | undefined;
    let updateOutput: Buffer | undefined;
    let finalOutput: Buffer | undefined;
    let authTag: Buffer | undefined;
    try {
      iv = randomBytes(12);
      aad = associatedData(tenantId, context, generated.keyVersion);
      const cipher = createCipheriv('aes-256-gcm', generated.plaintextKey, iv);
      cipher.setAAD(aad);
      updateOutput = cipher.update(plaintext);
      finalOutput = cipher.final();
      ciphertext = Buffer.concat([updateOutput, finalOutput]);
      authTag = cipher.getAuthTag();
      return {
        algorithm: 'A256GCM',
        keyVersion: generated.keyVersion,
        wrappedKey: generated.wrappedKey,
        iv: iv.toString('base64'),
        authTag: authTag.toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        tenantId,
        context,
      };
    } finally {
      zeroizeBytes(generated.plaintextKey);
      zeroizeBytes(aad);
      zeroizeBytes(iv);
      zeroizeBytes(ciphertext);
      zeroizeBytes(updateOutput);
      zeroizeBytes(finalOutput);
      zeroizeBytes(authTag);
    }
  }

  async reencrypt(
    envelope: EncryptedEnvelope,
    expectedTenantId: string,
    expectedContext: string
  ): Promise<EncryptedEnvelope> {
    const plaintext = await this.decrypt(envelope, expectedTenantId, expectedContext);
    try {
      return await this.encrypt(expectedTenantId, expectedContext, plaintext);
    } finally {
      plaintext.fill(0);
    }
  }

  async decrypt(
    envelope: EncryptedEnvelope,
    expectedTenantId: string,
    expectedContext: string
  ): Promise<Buffer> {
    const decoded = validateEnvelope(envelope, expectedTenantId, expectedContext);
    let key: Buffer | undefined;
    let aad: Buffer | undefined;
    let updateOutput: Buffer | undefined;
    let finalOutput: Buffer | undefined;
    try {
      key = await this.keyProvider.unwrapDataKey(
        expectedTenantId,
        envelope.wrappedKey,
        envelope.keyVersion,
        expectedContext
      );
      if (!Buffer.isBuffer(key) || key.length !== 32) {
        throw new Error('Key provider returned an invalid unwrapped key');
      }
      const decipher = createDecipheriv('aes-256-gcm', key, decoded.iv);
      aad = associatedData(expectedTenantId, expectedContext, envelope.keyVersion);
      decipher.setAAD(aad);
      decipher.setAuthTag(decoded.authTag);
      updateOutput = decipher.update(decoded.ciphertext);
      finalOutput = decipher.final();
      return Buffer.concat([updateOutput, finalOutput]);
    } finally {
      zeroizeBytes(key);
      aad?.fill(0);
      updateOutput?.fill(0);
      finalOutput?.fill(0);
      zeroizeBytes(decoded.iv);
      zeroizeBytes(decoded.authTag);
      zeroizeBytes(decoded.ciphertext);
    }
  }
}
