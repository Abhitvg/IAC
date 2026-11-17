import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import type { GeneratedDataKey, TenantKeyProvider } from './encryption';

const KEY_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

interface WrappedDataKey {
  version: 1;
  iv: string;
  authTag: string;
  ciphertext: string;
}

export interface MasterKeyTenantKeyProviderOptions {
  masterKeys: Record<string, string>;
  currentKeyVersion: string;
}

function decodeBase64(value: string, label: string, expectedLength?: number): Buffer {
  if (!value || !BASE64_PATTERN.test(value)) {
    throw new Error(`Invalid base64 value for ${label}`);
  }
  const decoded = Buffer.from(value, 'base64');
  if (decoded.toString('base64') !== value) {
    throw new Error(`Non-canonical base64 value for ${label}`);
  }
  if (expectedLength !== undefined && decoded.length !== expectedLength) {
    throw new Error(`Invalid byte length for ${label}`);
  }
  return decoded;
}

function validateContext(tenantId: string, context: string, keyVersion: string): void {
  if (
    !tenantId ||
    tenantId.length > 128 ||
    !/^[A-Za-z0-9._:@/-]+$/.test(tenantId) ||
    !context ||
    context.length > 256 ||
    !/^[A-Za-z0-9._:@/-]+$/.test(context) ||
    !KEY_VERSION_PATTERN.test(keyVersion)
  ) {
    throw new Error('Invalid tenant envelope encryption context');
  }
}

function wrappingAssociatedData(
  tenantId: string,
  context: string,
  keyVersion: string
): Buffer {
  return Buffer.from(
    JSON.stringify({
      application: 'careerops',
      tenant_id: tenantId,
      data_context: context,
      key_version: keyVersion,
    }),
    'utf8'
  );
}

/**
 * Wraps per-record random data keys locally with a master-key ring injected by
 * the ECS execution role from Secrets Manager. The application process never
 * calls AWS KMS; Secrets Manager handles encryption of the configuration secret.
 */
export class MasterKeyTenantKeyProvider implements TenantKeyProvider {
  private readonly masterKeys = new Map<string, Buffer>();
  private readonly currentKeyVersion: string;

  constructor(options: MasterKeyTenantKeyProviderOptions) {
    if (
      !options.masterKeys ||
      typeof options.masterKeys !== 'object' ||
      Array.isArray(options.masterKeys)
    ) {
      throw new Error('CAREEROPS_ENVELOPE_MASTER_KEYS must be a JSON key ring');
    }

    const entries = Object.entries(options.masterKeys);
    if (entries.length < 1 || entries.length > 8) {
      throw new Error('Envelope master-key ring must contain between one and eight versions');
    }

    try {
      for (const [version, encodedKey] of entries) {
        if (!KEY_VERSION_PATTERN.test(version) || typeof encodedKey !== 'string') {
          throw new Error('Envelope master-key ring contains an invalid version');
        }
        this.masterKeys.set(version, decodeBase64(encodedKey, version, 32));
      }

      if (
        !KEY_VERSION_PATTERN.test(options.currentKeyVersion) ||
        !this.masterKeys.has(options.currentKeyVersion)
      ) {
        throw new Error('Current envelope master-key version is missing from the key ring');
      }
      this.currentKeyVersion = options.currentKeyVersion;
    } catch (error) {
      this.destroy();
      throw error;
    }
  }

  async generateDataKey(tenantId: string, context: string): Promise<GeneratedDataKey> {
    const keyVersion = this.currentKeyVersion;
    validateContext(tenantId, context, keyVersion);
    const masterKey = this.masterKeys.get(keyVersion);
    if (!masterKey) throw new Error('Current envelope master key is unavailable');

    const plaintextKey = randomBytes(32);
    const iv = randomBytes(12);
    try {
      const cipher = createCipheriv('aes-256-gcm', masterKey, iv);
      cipher.setAAD(wrappingAssociatedData(tenantId, context, keyVersion));
      const ciphertext = Buffer.concat([cipher.update(plaintextKey), cipher.final()]);
      const wrapped: WrappedDataKey = {
        version: 1,
        iv: iv.toString('base64'),
        authTag: cipher.getAuthTag().toString('base64'),
        ciphertext: ciphertext.toString('base64'),
      };
      return {
        plaintextKey,
        wrappedKey: Buffer.from(JSON.stringify(wrapped), 'utf8').toString('base64'),
        keyVersion,
      };
    } catch (error) {
      plaintextKey.fill(0);
      throw error;
    }
  }

  async unwrapDataKey(
    tenantId: string,
    wrappedKey: string,
    keyVersion: string,
    context: string
  ): Promise<Buffer> {
    validateContext(tenantId, context, keyVersion);
    const masterKey = this.masterKeys.get(keyVersion);
    if (!masterKey) throw new Error('Encrypted envelope references an unavailable master-key version');
    if (!wrappedKey || wrappedKey.length > 16_384) {
      throw new Error('Invalid wrapped envelope data key');
    }

    const encoded = decodeBase64(wrappedKey, 'wrapped envelope data key');
    let wrapped: unknown;
    try {
      wrapped = JSON.parse(encoded.toString('utf8')) as unknown;
    } catch {
      throw new Error('Malformed wrapped envelope data key');
    }
    if (
      !wrapped ||
      typeof wrapped !== 'object' ||
      (wrapped as WrappedDataKey).version !== 1 ||
      Object.keys(wrapped).sort().join(',') !== 'authTag,ciphertext,iv,version'
    ) {
      throw new Error('Unsupported wrapped envelope data key');
    }

    const payload = wrapped as WrappedDataKey;
    const iv = decodeBase64(payload.iv, 'wrapped key IV', 12);
    const authTag = decodeBase64(payload.authTag, 'wrapped key authentication tag', 16);
    const ciphertext = decodeBase64(payload.ciphertext, 'wrapped key ciphertext', 32);
    const decipher = createDecipheriv('aes-256-gcm', masterKey, iv);
    decipher.setAAD(wrappingAssociatedData(tenantId, context, keyVersion));
    decipher.setAuthTag(authTag);
    const plaintextKey = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
    if (plaintextKey.length !== 32) {
      plaintextKey.fill(0);
      throw new Error('Unwrapped envelope data key has an invalid length');
    }
    return plaintextKey;
  }

  destroy(): void {
    for (const key of this.masterKeys.values()) key.fill(0);
    this.masterKeys.clear();
  }
}
