import { describe, expect, it, vi } from 'vitest';
import {
  DualReadTenantKeyProvider,
  KmsTenantKeyProvider,
  type KmsDataKeyOperations,
} from '../packages/cloud-core/src/kms-key-provider';
import type { TenantKeyProvider } from '../packages/cloud-core/src/encryption';

const keyArn = 'arn:aws:kms:ap-southeast-2:165328640460:key/11111111-2222-3333-4444-555555555555';
const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const context = 'career-graph:profile.current_role';

describe('KMS tenant envelope key provider', () => {
  it('uses AES_256 GenerateDataKey and binds tenant and purpose in KMS context', async () => {
    const plaintext = Buffer.alloc(32, 7);
    const ciphertext = Buffer.from('kms-ciphertext');
    const expectedWrappedKey = ciphertext.toString('base64');
    const generateDataKey = vi.fn(async () => ({
      Plaintext: plaintext,
      CiphertextBlob: ciphertext,
      KeyId: keyArn,
    }));
    const decrypt = vi.fn(async () => ({ Plaintext: Buffer.alloc(32, 7), KeyId: keyArn }));
    const provider = new KmsTenantKeyProvider({
      client: { generateDataKey, decrypt },
      keyArn,
      keyVersion: 'kms-v1',
    });

    const generated = await provider.generateDataKey(tenantId, context);
    expect(generated.plaintextKey).toEqual(Buffer.alloc(32, 7));
    expect(generated.keyVersion).toBe('kms-v1');
    expect(generated.wrappedKey).toBe(expectedWrappedKey);
    expect(generateDataKey).toHaveBeenCalledWith({
      KeyId: keyArn,
      KeySpec: 'AES_256',
      EncryptionContext: {
        application: 'careerops',
        tenant_id: tenantId,
        data_context: context,
        envelope_version: '1',
      },
    });
    expect(plaintext.every((byte) => byte === 0)).toBe(true);
    expect(ciphertext.every((byte) => byte === 0)).toBe(true);
    generated.plaintextKey.fill(0);
  });

  it('requires the exact tenant and data context when decrypting a wrapped key', async () => {
    const decrypt = vi.fn(async (input: { EncryptionContext: Record<string, string> }) => {
      if (
        input.EncryptionContext.tenant_id !== tenantId ||
        input.EncryptionContext.data_context !== context
      ) throw new Error('InvalidCiphertextException');
      return { Plaintext: Buffer.alloc(32, 9), KeyId: keyArn };
    });
    const provider = new KmsTenantKeyProvider({
      client: {
        generateDataKey: async () => ({}),
        decrypt,
      },
      keyArn,
      keyVersion: 'kms-v1',
    });
    const wrapped = Buffer.from('opaque-kms-blob').toString('base64');
    await expect(provider.unwrapDataKey(tenantId, wrapped, 'kms-v1', context)).resolves.toEqual(
      Buffer.alloc(32, 9)
    );
    await expect(
      provider.unwrapDataKey(tenantId, wrapped, 'kms-v1', 'linkedin-token:someone-else')
    ).rejects.toThrow('InvalidCiphertextException');
  });

  it('fails closed for unknown KMS key versions and malformed ciphertext', async () => {
    const decrypt = vi.fn(async () => ({ Plaintext: Buffer.alloc(32), KeyId: keyArn }));
    const provider = new KmsTenantKeyProvider({
      client: { generateDataKey: async () => ({}), decrypt },
      keyArn,
      keyVersion: 'kms-v1',
    });
    await expect(provider.unwrapDataKey(tenantId, 'YWJj', 'kms-v2', context)).rejects.toThrow(
      'unavailable KMS key version'
    );
    await expect(provider.unwrapDataKey(tenantId, 'not base64!', 'kms-v1', context)).rejects.toThrow(
      'Invalid KMS encrypted data key'
    );
    expect(decrypt).not.toHaveBeenCalled();
  });

  it('dual-reads legacy envelopes while directing all new writes to KMS', async () => {
    const kms = new KmsTenantKeyProvider({
      keyArn,
      keyVersion: 'kms-v1',
      client: {
        generateDataKey: async () => ({
          Plaintext: Buffer.alloc(32, 1),
          CiphertextBlob: Buffer.from('kms'),
        }),
        decrypt: async () => ({ Plaintext: Buffer.alloc(32, 1) }),
      },
    });
    const legacyUnwrap = vi.fn(async () => Buffer.alloc(32, 2));
    const legacy: TenantKeyProvider = {
      generateDataKey: async () => { throw new Error('legacy writes must not be used'); },
      unwrapDataKey: legacyUnwrap,
    };
    const provider = new DualReadTenantKeyProvider(kms, legacy);

    const generated = await provider.generateDataKey(tenantId, context);
    expect(generated.keyVersion).toBe('kms-v1');
    generated.plaintextKey.fill(0);

    const legacyKey = await provider.unwrapDataKey(
      tenantId, Buffer.from('legacy').toString('base64'), 'v1', context
    );
    expect(legacyUnwrap).toHaveBeenCalledOnce();
    legacyKey.fill(0);
  });
});
