import { describe, expect, it, vi } from 'vitest';
import {
  DualReadTenantKeyProvider,
  KmsTenantKeyProvider,
  type KmsDataKeyOperations,
} from '../packages/cloud-core/src/kms-key-provider';
import { TenantEnvelopeCipher, type TenantKeyProvider } from '../packages/cloud-core/src/encryption';
import { AwsSdkKmsDataKeyOperations } from '../packages/cloud-core/src/aws-sdk-kms-operations';

const keyArn = 'arn:aws:kms:ap-southeast-2:165328640460:key/11111111-2222-3333-4444-555555555555';
const tenantId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const context = 'career-graph:profile.current_role';

describe('KMS tenant envelope key provider', () => {
  it('adapts AWS SDK v3 command constructors to the narrow data-key interface', async () => {
    class GenerateDataKeyCommand {
      constructor(readonly input: {
        KeyId: string;
        KeySpec: 'AES_256';
        EncryptionContext: Record<string, string>;
      }) {}
    }
    class DecryptCommand {
      constructor(readonly input: {
        KeyId: string;
        CiphertextBlob: Uint8Array;
        EncryptionContext: Record<string, string>;
      }) {}
    }
    const destroy = vi.fn();
    const send = vi.fn(async (command: { input: Record<string, unknown> }) => {
      if ('KeySpec' in command.input) {
        return { Plaintext: Buffer.alloc(32, 5), CiphertextBlob: Buffer.from('wrapped'), KeyId: keyArn };
      }
      return { Plaintext: Buffer.alloc(32, 6), KeyId: keyArn };
    });
    const adapter = new AwsSdkKmsDataKeyOperations(
      { send, destroy },
      { GenerateDataKeyCommand, DecryptCommand }
    );
    const context = { application: 'careerops', tenant_id: tenantId, data_context: 'profile' };
    const generated = await adapter.generateDataKey({
      KeyId: keyArn,
      KeySpec: 'AES_256',
      EncryptionContext: context,
    });
    expect(generated.KeyId).toBe(keyArn);
    expect(send.mock.calls[0]?.[0]).toBeInstanceOf(GenerateDataKeyCommand);
    const decrypted = await adapter.decrypt({
      KeyId: keyArn,
      CiphertextBlob: Buffer.from('wrapped'),
      EncryptionContext: context,
    });
    expect(decrypted.KeyId).toBe(keyArn);
    expect(send.mock.calls[1]?.[0]).toBeInstanceOf(DecryptCommand);
    adapter.destroy();
    adapter.destroy();
    expect(destroy).toHaveBeenCalledOnce();
    await expect(adapter.generateDataKey({
      KeyId: keyArn,
      KeySpec: 'AES_256',
      EncryptionContext: context,
    })).rejects.toThrow('has been destroyed');
  });

  it('accepts canonical AWS key ARNs and rejects malformed key configuration', () => {
    expect(() => new KmsTenantKeyProvider({
      client: { generateDataKey: async () => ({}), decrypt: async () => ({}) },
      keyArn,
      keyVersion: 'kms-v1',
    })).not.toThrow();

    for (const invalidArn of [
      'arn:aws:kms:ap-southeast-2:12345678901:key/11111111-2222-3333-4444-555555555555',
      'arn:aws:kms:ap-southeast-2:123456789012:alias/application-envelope',
      'arn:aws:kms:ap-southeast-2:123456789012:key/not-a-key-id',
      'arn:aws:kms:ap-southeast-2:123456789012:key/11111111-2222-3333-4444-555555555555:extra',
    ]) {
      expect(() => new KmsTenantKeyProvider({
        client: { generateDataKey: async () => ({}), decrypt: async () => ({}) },
        keyArn: invalidArn,
        keyVersion: 'kms-v1',
      })).toThrow('Invalid KMS tenant key provider configuration');
    }

    expect(() => new KmsTenantKeyProvider({
      client: { generateDataKey: async () => ({}), decrypt: async () => ({}) },
      keyArn,
      keyVersion: 'v1',
    })).toThrow('Invalid KMS tenant key provider configuration');
  });

  it('fails closed and zeroizes plaintext when KMS decrypt reports a different key ARN', async () => {
    const sdkPlaintext = Buffer.alloc(32, 4);
    const provider = new KmsTenantKeyProvider({
      keyArn,
      keyVersion: 'kms-v1',
      client: {
        generateDataKey: async () => ({}),
        decrypt: async () => ({
          Plaintext: sdkPlaintext,
          KeyId: 'arn:aws:kms:ap-southeast-2:165328640460:key/aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
        }),
      },
    });
    await expect(
      provider.unwrapDataKey(tenantId, Buffer.from('opaque').toString('base64'), 'kms-v1', context)
    ).rejects.toThrow('unexpected key identifier');
    expect(sdkPlaintext.every((byte) => byte === 0)).toBe(true);
  });

  it('rejects KMS responses that omit the configured key identifier', async () => {
    const plaintext = Buffer.alloc(32, 8);
    const provider = new KmsTenantKeyProvider({
      keyArn,
      keyVersion: 'kms-v1',
      client: {
        generateDataKey: async () => ({
          Plaintext: plaintext,
          CiphertextBlob: Buffer.from('wrapped'),
        }),
        decrypt: async () => ({ Plaintext: Buffer.alloc(32, 8) }),
      },
    });

    await expect(provider.generateDataKey(tenantId, context)).rejects.toThrow(
      'unexpected key identifier'
    );
    expect(plaintext.every((byte) => byte === 0)).toBe(true);
    await expect(
      provider.unwrapDataKey(tenantId, Buffer.from('wrapped').toString('base64'), 'kms-v1', context)
    ).rejects.toThrow('unexpected key identifier');
  });

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

  it('round-trips a complete AES-GCM envelope through the KMS provider', async () => {
    const dataKey = Buffer.alloc(32, 31);
    const ciphertextBlob = Buffer.from('opaque-kms-data-key');
    const client: KmsDataKeyOperations = {
      generateDataKey: async () => ({
        Plaintext: Buffer.from(dataKey),
        CiphertextBlob: Buffer.from(ciphertextBlob),
        KeyId: keyArn,
      }),
      decrypt: async (input) => {
        expect(input.EncryptionContext.tenant_id).toBe(tenantId);
        expect(input.EncryptionContext.data_context).toBe(context);
        return { Plaintext: Buffer.from(dataKey), KeyId: keyArn };
      },
    };
    const provider = new KmsTenantKeyProvider({ client, keyArn, keyVersion: 'kms-v1' });
    const cipher = new TenantEnvelopeCipher(provider);
    const original = Buffer.from('sensitive career graph value');
    const envelope = await cipher.encrypt(tenantId, context, original);
    expect(envelope.keyVersion).toBe('kms-v1');
    const recovered = await cipher.decrypt(envelope, tenantId, context);
    expect(recovered).toEqual(original);
    recovered.fill(0);
    dataKey.fill(0);
  });

  it('zeroizes generated data keys when envelope encryption rejects invalid context', async () => {
    const generatedKey = Buffer.alloc(32, 0x5a);
    const provider: TenantKeyProvider = {
      generateDataKey: async () => ({
        plaintextKey: generatedKey,
        wrappedKey: Buffer.from('wrapped').toString('base64'),
        keyVersion: 'kms-v1',
      }),
      unwrapDataKey: async () => Buffer.alloc(32),
    };
    const cipher = new TenantEnvelopeCipher(provider);

    await expect(cipher.encrypt(tenantId, 'invalid context with spaces', Buffer.from('secret')))
      .rejects.toThrow('Invalid encryption context');
    expect(generatedKey.every((byte) => byte === 0)).toBe(true);
  });

  it('zeroizes generated data keys after successful envelope encryption', async () => {
    const generatedKey = Buffer.alloc(32, 0x6b);
    const provider: TenantKeyProvider = {
      generateDataKey: async () => ({
        plaintextKey: generatedKey,
        wrappedKey: Buffer.from('wrapped').toString('base64'),
        keyVersion: 'kms-v1',
      }),
      unwrapDataKey: async () => Buffer.alloc(32),
    };
    const cipher = new TenantEnvelopeCipher(provider);

    const envelope = await cipher.encrypt(tenantId, context, Buffer.from('secret'));

    expect(envelope.ciphertext).not.toBe('');
    expect(generatedKey.every((byte) => byte === 0)).toBe(true);
  });

  it('destroys the KMS client at most once and rejects use after shutdown', async () => {
    const destroy = vi.fn();
    const generateDataKey = vi.fn(async () => ({
      Plaintext: Buffer.alloc(32, 1),
      CiphertextBlob: Buffer.from('wrapped'),
      KeyId: keyArn,
    }));
    const provider = new KmsTenantKeyProvider({
      keyArn,
      keyVersion: 'kms-v1',
      client: {
        generateDataKey,
        decrypt: async () => ({ Plaintext: Buffer.alloc(32, 1), KeyId: keyArn }),
        destroy,
      },
    });

    provider.destroy();
    provider.destroy();

    expect(destroy).toHaveBeenCalledOnce();
    await expect(provider.generateDataKey(tenantId, context)).rejects.toThrow('has been destroyed');
    expect(generateDataKey).not.toHaveBeenCalled();
  });

  it('destroys both dual-read providers once, even when shutdown is repeated', async () => {
    const kmsDestroy = vi.fn();
    const legacyDestroy = vi.fn();
    const kms = new KmsTenantKeyProvider({
      keyArn,
      keyVersion: 'kms-v1',
      client: {
        generateDataKey: async () => ({}),
        decrypt: async () => ({}),
        destroy: kmsDestroy,
      },
    });
    const legacy: TenantKeyProvider & { destroy: () => void } = {
      generateDataKey: async () => { throw new Error('legacy writes must not be used'); },
      unwrapDataKey: async () => Buffer.alloc(32),
      destroy: legacyDestroy,
    };
    const provider = new DualReadTenantKeyProvider(kms, legacy);

    provider.destroy();
    provider.destroy();

    expect(kmsDestroy).toHaveBeenCalledOnce();
    expect(legacyDestroy).toHaveBeenCalledOnce();
    expect(() => provider.generateDataKey(tenantId, context)).toThrow('has been destroyed');
  });

  it('dual-reads legacy envelopes while directing all new writes to KMS', async () => {
    const kms = new KmsTenantKeyProvider({
      keyArn,
      keyVersion: 'kms-v1',
      client: {
        generateDataKey: async () => ({
          Plaintext: Buffer.alloc(32, 1),
          CiphertextBlob: Buffer.from('kms'),
          KeyId: keyArn,
        }),
        decrypt: async () => ({ Plaintext: Buffer.alloc(32, 1), KeyId: keyArn }),
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
