import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

export interface GeneratedDataKey {
  plaintextKey: Buffer;
  wrappedKey: string;
  keyVersion: string;
}

export interface TenantKeyManagementService {
  generateDataKey(tenantId: string, context: string): Promise<GeneratedDataKey>;
  unwrapDataKey(tenantId: string, wrappedKey: string, keyVersion: string, context: string): Promise<Buffer>;
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

function associatedData(tenantId: string, context: string, keyVersion: string): Buffer {
  if (!tenantId || !context || tenantId.length > 128 || context.length > 256) {
    throw new Error('Invalid encryption context');
  }
  return Buffer.from(`careerops:v1|${tenantId}|${context}|${keyVersion}`, 'utf8');
}

export class TenantEnvelopeCipher {
  constructor(private readonly kms: TenantKeyManagementService) {}

  async encrypt(tenantId: string, context: string, plaintext: Buffer): Promise<EncryptedEnvelope> {
    const generated = await this.kms.generateDataKey(tenantId, context);
    if (generated.plaintextKey.length !== 32 || !generated.wrappedKey || !generated.keyVersion) {
      generated.plaintextKey.fill(0);
      throw new Error('KMS returned an invalid data key');
    }
    const iv = randomBytes(12);
    try {
      const cipher = createCipheriv('aes-256-gcm', generated.plaintextKey, iv);
      cipher.setAAD(associatedData(tenantId, context, generated.keyVersion));
      const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      return {
        algorithm: 'A256GCM',
        keyVersion: generated.keyVersion,
        wrappedKey: generated.wrappedKey,
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
        tenantId,
        context,
      };
    } finally {
      generated.plaintextKey.fill(0);
    }
  }

  async decrypt(envelope: EncryptedEnvelope, expectedTenantId: string, expectedContext: string): Promise<Buffer> {
    if (
      envelope.algorithm !== 'A256GCM' ||
      envelope.tenantId !== expectedTenantId ||
      envelope.context !== expectedContext
    ) {
      throw new Error('Encrypted envelope tenant or context mismatch');
    }
    const key = await this.kms.unwrapDataKey(
      expectedTenantId,
      envelope.wrappedKey,
      envelope.keyVersion,
      expectedContext
    );
    if (key.length !== 32) {
      key.fill(0);
      throw new Error('KMS returned an invalid unwrapped key');
    }
    try {
      const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(envelope.iv, 'base64'));
      decipher.setAAD(associatedData(expectedTenantId, expectedContext, envelope.keyVersion));
      decipher.setAuthTag(Buffer.from(envelope.authTag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(envelope.ciphertext, 'base64')),
        decipher.final(),
      ]);
    } finally {
      key.fill(0);
    }
  }
}
