import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

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

interface KeyringDocument {
  currentVersion: string;
  keys: Record<string, string>;
}

function validateIdentity(tenantId: string, context: string): void {
  if (!tenantId || !context || tenantId.length > 128 || context.length > 256) {
    throw new Error('Invalid encryption context');
  }
}

function associatedData(tenantId: string, context: string, keyVersion: string): Buffer {
  validateIdentity(tenantId, context);
  return Buffer.from(`careerops:dek:v1|${tenantId}|${context}|${keyVersion}`, 'utf8');
}

function deriveWrappingKey(
  masterKey: Buffer,
  tenantId: string,
  context: string,
  keyVersion: string
): Buffer {
  return Buffer.from(
    hkdfSync(
      'sha256',
      masterKey,
      Buffer.from(`careerops:${tenantId}`, 'utf8'),
      Buffer.from(`careerops:envelope-wrap:v1:${context}:${keyVersion}`, 'utf8'),
      32
    )
  );
}

/**
 * Uses a versioned application keyring injected at runtime by the deployment
 * platform. It does not call a cloud KMS API. Keep old key versions available
 * until every envelope encrypted with them has been re-encrypted.
 */
export class EnvironmentTenantKeyProvider implements TenantKeyProvider {
  private constructor(
    private readonly currentVersion: string,
    private readonly keys: ReadonlyMap<string, Buffer>
  ) {}

  static fromJson(raw: string): EnvironmentTenantKeyProvider {
    if (!raw || raw.length > 32_768) throw new Error('Invalid application keyring configuration');
    let parsed: KeyringDocument;
    try {
      parsed = JSON.parse(raw) as KeyringDocument;
    } catch {
      throw new Error('Application keyring must be valid JSON');
    }
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      typeof parsed.currentVersion !== 'string' ||
      !/^[A-Za-z0-9._-]{1,64}$/.test(parsed.currentVersion) ||
      !parsed.keys ||
      typeof parsed.keys !== 'object' ||
      Array.isArray(parsed.keys)
    ) {
      throw new Error('Invalid application keyring structure');
    }

    const keys = new Map<string, Buffer>();
    for (const [version, encoded] of Object.entries(parsed.keys)) {
      if (
        !/^[A-Za-z0-9._-]{1,64}$/.test(version) ||
        typeof encoded !== 'string' ||
        !/^[A-Za-z0-9+/]{43}=$/.test(encoded)
      ) {
        throw new Error('Invalid application keyring entry');
      }
      const key = Buffer.from(encoded, 'base64');
      if (key.length !== 32 || key.toString('base64') !== encoded) {
        key.fill(0);
        throw new Error('Application keyring keys must be canonical base64-encoded 32-byte values');
      }
      keys.set(version, key);
    }
    if (!keys.has(parsed.currentVersion) || keys.size === 0) {
      for (const key of keys.values()) key.fill(0);
      throw new Error('Application keyring currentVersion must reference an available key');
    }
    return new EnvironmentTenantKeyProvider(parsed.currentVersion, keys);
  }

  async generateDataKey(tenantId: string, context: string): Promise<GeneratedDataKey> {
    validateIdentity(tenantId, context);
    const plaintextKey = randomBytes(32);
    const masterKey = this.keys.get(this.currentVersion);
    if (!masterKey) {
      plaintextKey.fill(0);
      throw new Error('Current application encryption key is unavailable');
    }
    const wrappingKey = deriveWrappingKey(masterKey, tenantId, context, this.currentVersion);
    const iv = randomBytes(12);
    try {
      const cipher = createCipheriv('aes-256-gcm', wrappingKey, iv);
      cipher.setAAD(associatedData(tenantId, context, this.currentVersion));
      const ciphertext = Buffer.concat([cipher.update(plaintextKey), cipher.final()]);
      const wrappedKey = Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString('base64');
      return { plaintextKey, wrappedKey, keyVersion: this.currentVersion };
    } catch (error) {
      plaintextKey.fill(0);
      throw error;
    } finally {
      wrappingKey.fill(0);
    }
  }

  async unwrapDataKey(
    tenantId: string,
    wrappedKey: string,
    keyVersion: string,
    context: string
  ): Promise<Buffer> {
    validateIdentity(tenantId, context);
    const masterKey = this.keys.get(keyVersion);
    if (!masterKey || typeof wrappedKey !== 'string' || wrappedKey.length > 512) {
      throw new Error('Application encryption key version is unavailable');
    }
    const packed = Buffer.from(wrappedKey, 'base64');
    if (packed.toString('base64') !== wrappedKey || packed.length !== 60) {
      throw new Error('Invalid wrapped data key');
    }
    const wrappingKey = deriveWrappingKey(masterKey, tenantId, context, keyVersion);
    try {
      const decipher = createDecipheriv('aes-256-gcm', wrappingKey, packed.subarray(0, 12));
      decipher.setAAD(associatedData(tenantId, context, keyVersion));
      decipher.setAuthTag(packed.subarray(12, 28));
      const plaintext = Buffer.concat([
        decipher.update(packed.subarray(28)),
        decipher.final(),
      ]);
      if (plaintext.length !== 32) {
        plaintext.fill(0);
        throw new Error('Invalid unwrapped data key length');
      }
      return plaintext;
    } catch {
      throw new Error('Unable to unwrap application data key');
    } finally {
      wrappingKey.fill(0);
      packed.fill(0);
    }
  }
}

export class TenantEnvelopeCipher {
  constructor(private readonly keyProvider: TenantKeyProvider) {}

  async encrypt(tenantId: string, context: string, plaintext: Buffer): Promise<EncryptedEnvelope> {
    const generated = await this.keyProvider.generateDataKey(tenantId, context);
    if (generated.plaintextKey.length !== 32 || !generated.wrappedKey || !generated.keyVersion) {
      generated.plaintextKey.fill(0);
      throw new Error('Key provider returned an invalid data key');
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

  async decrypt(
    envelope: EncryptedEnvelope,
    expectedTenantId: string,
    expectedContext: string
  ): Promise<Buffer> {
    if (
      envelope.algorithm !== 'A256GCM' ||
      envelope.tenantId !== expectedTenantId ||
      envelope.context !== expectedContext
    ) {
      throw new Error('Encrypted envelope tenant or context mismatch');
    }
    const key = await this.keyProvider.unwrapDataKey(
      expectedTenantId,
      envelope.wrappedKey,
      envelope.keyVersion,
      expectedContext
    );
    if (key.length !== 32) {
      key.fill(0);
      throw new Error('Key provider returned an invalid unwrapped key');
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
