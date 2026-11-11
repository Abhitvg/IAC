import { describe, expect, it, vi } from 'vitest';
import {
  TenantEnvelopeCipher,
  type TenantKeyManagementService,
} from '../packages/cloud-core/src/encryption';

const tenantId = '10000000-0000-4000-8000-000000000001';
const context = 'career-graph:profile.current_role';
const testKey = Buffer.from('0123456789abcdef0123456789abcdef', 'utf8');

function createKms(overrides: Partial<TenantKeyManagementService> = {}) {
  const generateDataKey = vi.fn(async () => ({
    plaintextKey: Buffer.from(testKey),
    wrappedKey: 'provider-wrapped-data-key',
    keyVersion: 'kms-key-version-1',
  }));
  const unwrapDataKey = vi.fn(async () => Buffer.from(testKey));
  const kms: TenantKeyManagementService = {
    generateDataKey,
    unwrapDataKey,
    ...overrides,
  };
  return { kms, generateDataKey, unwrapDataKey };
}

describe('Tenant envelope encryption', () => {
  it('round-trips AES-256-GCM data with tenant and fact context binding', async () => {
    const { kms, generateDataKey, unwrapDataKey } = createKms();
    const cipher = new TenantEnvelopeCipher(kms);
    const plaintext = Buffer.from('Senior Software Engineer', 'utf8');

    const envelope = await cipher.encrypt(tenantId, context, plaintext);
    expect(envelope).toMatchObject({
      algorithm: 'A256GCM',
      tenantId,
      context,
      keyVersion: 'kms-key-version-1',
      wrappedKey: 'provider-wrapped-data-key',
    });
    expect(envelope.ciphertext).not.toContain(plaintext.toString('utf8'));
    expect(generateDataKey).toHaveBeenCalledWith(tenantId, context);

    const decrypted = await cipher.decrypt(envelope, tenantId, context);
    expect(decrypted).toEqual(plaintext);
    expect(unwrapDataKey).toHaveBeenCalledWith(
      tenantId,
      envelope.wrappedKey,
      envelope.keyVersion,
      context
    );
  });

  it('rejects a different tenant or context before asking KMS to unwrap', async () => {
    const { kms, unwrapDataKey } = createKms();
    const cipher = new TenantEnvelopeCipher(kms);
    const envelope = await cipher.encrypt(tenantId, context, Buffer.from('candidate fact'));

    await expect(
      cipher.decrypt(envelope, '20000000-0000-4000-8000-000000000002', context)
    ).rejects.toThrow(/tenant or context mismatch/);
    await expect(
      cipher.decrypt(envelope, tenantId, 'career-graph:profile.email')
    ).rejects.toThrow(/tenant or context mismatch/);
    expect(unwrapDataKey).not.toHaveBeenCalled();
  });

  it('authenticates ciphertext and key version using AES-GCM and associated data', async () => {
    const { kms } = createKms();
    const cipher = new TenantEnvelopeCipher(kms);
    const envelope = await cipher.encrypt(tenantId, context, Buffer.from('candidate fact'));

    await expect(
      cipher.decrypt({ ...envelope, ciphertext: Buffer.from('tampered').toString('base64') }, tenantId, context)
    ).rejects.toThrow();

    await expect(
      cipher.decrypt({ ...envelope, keyVersion: 'rotated-key-version' }, tenantId, context)
    ).rejects.toThrow();
  });

  it('rejects malformed cryptographic fields before contacting KMS', async () => {
    const { kms, unwrapDataKey } = createKms();
    const cipher = new TenantEnvelopeCipher(kms);
    const envelope = await cipher.encrypt(tenantId, context, Buffer.from('candidate fact'));

    await expect(cipher.decrypt({ ...envelope, iv: 'AA==' }, tenantId, context)).rejects.toThrow(
      /cryptographic fields/
    );
    await expect(
      cipher.decrypt({ ...envelope, authTag: 'not-base64' }, tenantId, context)
    ).rejects.toThrow(/authentication tag/);
    expect(unwrapDataKey).not.toHaveBeenCalled();
  });

  it('zeroes plaintext data-key buffers after encryption and decryption', async () => {
    const generatedKey = Buffer.from(testKey);
    const unwrappedKey = Buffer.from(testKey);
    const kms: TenantKeyManagementService = {
      generateDataKey: async () => ({
        plaintextKey: generatedKey,
        wrappedKey: 'provider-wrapped-data-key',
        keyVersion: 'kms-key-version-1',
      }),
      unwrapDataKey: async () => unwrappedKey,
    };
    const cipher = new TenantEnvelopeCipher(kms);
    const envelope = await cipher.encrypt(tenantId, context, Buffer.from('candidate fact'));
    expect(generatedKey.equals(Buffer.alloc(32))).toBe(true);

    await cipher.decrypt(envelope, tenantId, context);
    expect(unwrappedKey.equals(Buffer.alloc(32))).toBe(true);
  });

  it('fails closed when KMS returns an invalid key', async () => {
    const invalidKey = Buffer.alloc(16, 7);
    const kms: TenantKeyManagementService = {
      generateDataKey: async () => ({
        plaintextKey: invalidKey,
        wrappedKey: 'wrapped',
        keyVersion: 'v1',
      }),
      unwrapDataKey: async () => Buffer.alloc(16, 7),
    };
    const cipher = new TenantEnvelopeCipher(kms);

    await expect(cipher.encrypt(tenantId, context, Buffer.from('fact'))).rejects.toThrow(
      /invalid data key/
    );
    expect(invalidKey.equals(Buffer.alloc(16))).toBe(true);
    await expect(
      cipher.decrypt(
        {
          algorithm: 'A256GCM',
          keyVersion: 'v1',
          wrappedKey: 'wrapped',
          iv: 'AAAAAAAAAAAAAAAA',
          authTag: 'AAAAAAAAAAAAAAAAAAAAAA==',
          ciphertext: 'YQ==',
          tenantId,
          context,
        },
        tenantId,
        context
      )
    ).rejects.toThrow(/invalid unwrapped key/);
  });

  it('rejects empty plaintext and invalid encryption context', async () => {
    const { kms } = createKms();
    const cipher = new TenantEnvelopeCipher(kms);
    await expect(cipher.encrypt(tenantId, context, Buffer.alloc(0))).rejects.toThrow(
      /non-empty Buffer/
    );
    await expect(cipher.encrypt('', context, Buffer.from('fact'))).rejects.toThrow(
      /Invalid encryption context/
    );
  });
});
