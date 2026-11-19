import type { GeneratedDataKey, TenantKeyProvider } from './encryption';

const KMS_VERSION = /^kms-v[1-9][0-9]{0,2}$/;
const BASE64 = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;

export interface KmsDataKeyOperations {
  destroy?(): void;
  generateDataKey(input: {
    KeyId: string;
    KeySpec: 'AES_256';
    EncryptionContext: Record<string, string>;
  }): Promise<{ Plaintext?: Uint8Array; CiphertextBlob?: Uint8Array; KeyId?: string }>;
  decrypt(input: {
    KeyId: string;
    CiphertextBlob: Uint8Array;
    EncryptionContext: Record<string, string>;
  }): Promise<{ Plaintext?: Uint8Array; KeyId?: string }>;
}

export interface KmsTenantKeyProviderOptions {
  client: KmsDataKeyOperations;
  keyArn: string;
  keyVersion: string;
}

function validate(tenantId: string, context: string, version: string): void {
  if (
    typeof tenantId !== 'string' || !tenantId || tenantId.length > 128 ||
    !/^[A-Za-z0-9._:@/-]+$/.test(tenantId) ||
    typeof context !== 'string' || !context || context.length > 256 ||
    !/^[A-Za-z0-9._:@/-]+$/.test(context) || !KMS_VERSION.test(version)
  ) throw new Error('Invalid KMS tenant envelope context');
}

function encryptionContext(tenantId: string, context: string): Record<string, string> {
  return {
    application: 'careerops',
    tenant_id: tenantId,
    data_context: context,
    envelope_version: '1',
  };
}

function decodeCiphertext(value: string): Buffer {
  if (typeof value !== 'string' || value.length < 4 || value.length > 16_384 || !BASE64.test(value)) {
    throw new Error('Invalid KMS encrypted data key');
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.toString('base64') !== value) {
    bytes.fill(0);
    throw new Error('Non-canonical KMS encrypted data key');
  }
  return bytes;
}

function assertKeyId(actual: string | undefined, expected: string): void {
  // KMS returns KeyId for both operations. Treat an omitted identifier exactly
  // like a mismatched one; accepting it weakens the configured-key boundary.
  if (actual !== expected) throw new Error('KMS returned an unexpected key identifier');
}

/** KMS protects per-record AES-256 data keys; TenantEnvelopeCipher encrypts payloads locally. */
export class KmsTenantKeyProvider implements TenantKeyProvider {
  private readonly client: KmsDataKeyOperations;
  private readonly keyArn: string;
  private readonly keyVersion: string;
  private destroyed = false;

  constructor(options: KmsTenantKeyProviderOptions) {
    if (
      !options?.client ||
      typeof options.client.generateDataKey !== 'function' ||
      typeof options.client.decrypt !== 'function' ||
      typeof options.keyArn !== 'string' ||
      !/^arn:(?:aws|aws-us-gov|aws-cn|aws-iso|aws-iso-b):kms:[a-z0-9-]+:\d{12}:key\/[A-Fa-f0-9-]{36}$/.test(options.keyArn) ||
      !KMS_VERSION.test(options.keyVersion)
    ) throw new Error('Invalid KMS tenant key provider configuration');
    this.client = options.client;
    this.keyArn = options.keyArn;
    this.keyVersion = options.keyVersion;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.client.destroy?.();
  }

  async generateDataKey(tenantId: string, context: string): Promise<GeneratedDataKey> {
    if (this.destroyed) throw new Error('KMS tenant key provider has been destroyed');
    validate(tenantId, context, this.keyVersion);
    const result = await this.client.generateDataKey({
      KeyId: this.keyArn,
      KeySpec: 'AES_256',
      EncryptionContext: encryptionContext(tenantId, context),
    });
    const plaintext = result.Plaintext ? Buffer.from(result.Plaintext) : undefined;
    const ciphertext = result.CiphertextBlob ? Buffer.from(result.CiphertextBlob) : undefined;
    try {
      assertKeyId(result.KeyId, this.keyArn);
      if (!plaintext || plaintext.length !== 32 || !ciphertext?.length) {
        throw new Error('KMS returned an invalid GenerateDataKey response');
      }
      return {
        plaintextKey: Buffer.from(plaintext),
        wrappedKey: ciphertext.toString('base64'),
        keyVersion: this.keyVersion,
      };
    } finally {
      plaintext?.fill(0);
      result.Plaintext?.fill(0);
      ciphertext?.fill(0);
      result.CiphertextBlob?.fill(0);
    }
  }

  async unwrapDataKey(
    tenantId: string, wrappedKey: string, keyVersion: string, context: string
  ): Promise<Buffer> {
    if (this.destroyed) throw new Error('KMS tenant key provider has been destroyed');
    validate(tenantId, context, keyVersion);
    if (keyVersion !== this.keyVersion) {
      throw new Error('Encrypted envelope references an unavailable KMS key version');
    }
    const ciphertext = decodeCiphertext(wrappedKey);
    let plaintext: Buffer | undefined;
    let sdkPlaintext: Uint8Array | undefined;
    try {
      const result = await this.client.decrypt({
        KeyId: this.keyArn,
        CiphertextBlob: ciphertext,
        EncryptionContext: encryptionContext(tenantId, context),
      });
      sdkPlaintext = result.Plaintext;
      assertKeyId(result.KeyId, this.keyArn);
      plaintext = result.Plaintext ? Buffer.from(result.Plaintext) : undefined;
      if (!plaintext || plaintext.length !== 32) throw new Error('KMS returned an invalid Decrypt response');
      return Buffer.from(plaintext);
    } finally {
      ciphertext.fill(0);
      plaintext?.fill(0);
      sdkPlaintext?.fill(0);
    }
  }
}

/** New writes use KMS; reads retain compatibility with legacy local-key envelopes. */
export class DualReadTenantKeyProvider implements TenantKeyProvider {
  private destroyed = false;

  constructor(
    private readonly kmsProvider: KmsTenantKeyProvider,
    private readonly legacyProvider: TenantKeyProvider
  ) {}

  generateDataKey(tenantId: string, context: string): Promise<GeneratedDataKey> {
    if (this.destroyed) throw new Error('Dual-read tenant key provider has been destroyed');
    return this.kmsProvider.generateDataKey(tenantId, context);
  }

  unwrapDataKey(tenantId: string, wrappedKey: string, keyVersion: string, context: string): Promise<Buffer> {
    if (this.destroyed) throw new Error('Dual-read tenant key provider has been destroyed');
    return KMS_VERSION.test(keyVersion)
      ? this.kmsProvider.unwrapDataKey(tenantId, wrappedKey, keyVersion, context)
      : this.legacyProvider.unwrapDataKey(tenantId, wrappedKey, keyVersion, context);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    const legacy = this.legacyProvider as TenantKeyProvider & { destroy?: () => void };
    try {
      this.kmsProvider.destroy();
    } finally {
      legacy.destroy?.();
    }
  }
}
