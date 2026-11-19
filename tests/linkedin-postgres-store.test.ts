import { describe, expect, it, vi } from 'vitest';
import { LinkedInPostgresStore, type LinkedInSqlPool } from '../apps/api/src/linkedin/postgres-store';
import type { TenantEnvelopeCipher } from '../packages/cloud-core/src/encryption';

function pool(): LinkedInSqlPool {
  return {
    connect: async () => ({
      query: async () => ({ rows: [], rowCount: 1 }),
      release: vi.fn(),
    }),
  };
}

describe('LinkedInPostgresStore plaintext token lifecycle', () => {
  it('zeroizes serialized OAuth tokens after successful encryption', async () => {
    let plaintext: Buffer | undefined;
    const cipher = {
      encrypt: vi.fn(async (_tenantId: string, _context: string, value: Buffer) => {
        plaintext = value;
        return {
          algorithm: 'A256GCM' as const,
          keyVersion: 'v1',
          wrappedKey: 'wrapped',
          iv: 'AAAAAAAAAAAAAAAA',
          authTag: 'AAAAAAAAAAAAAAAAAAAAAA==',
          ciphertext: 'AAAA',
          tenantId: 'tenant-1',
          context: 'linkedin-token:subject-1',
        };
      }),
    } as unknown as TenantEnvelopeCipher;
    const store = new LinkedInPostgresStore(pool(), cipher);

    await store.put(
      { tenantId: 'tenant-1', subject: 'subject-1' },
      {
        accessToken: 'sensitive-access-token',
        memberId: 'member_1',
        tokenType: 'Bearer',
        grantedScopes: ['openid'],
        expiresAt: Date.now() + 60_000,
      }
    );

    expect(plaintext).toBeDefined();
    expect(plaintext?.every((byte) => byte === 0)).toBe(true);
  });

  it('zeroizes serialized OAuth tokens when encryption rejects', async () => {
    let plaintext: Buffer | undefined;
    const cipher = {
      encrypt: vi.fn(async (_tenantId: string, _context: string, value: Buffer) => {
        plaintext = value;
        throw new Error('encryption failed');
      }),
    } as unknown as TenantEnvelopeCipher;
    const store = new LinkedInPostgresStore(pool(), cipher);

    await expect(
      store.put(
        { tenantId: 'tenant-1', subject: 'subject-1' },
        {
          accessToken: 'sensitive-access-token',
          memberId: 'member_1',
          tokenType: 'Bearer',
          grantedScopes: ['openid'],
          expiresAt: Date.now() + 60_000,
        }
      )
    ).rejects.toThrow('encryption failed');

    expect(plaintext).toBeDefined();
    expect(plaintext?.every((byte) => byte === 0)).toBe(true);
  });
});
