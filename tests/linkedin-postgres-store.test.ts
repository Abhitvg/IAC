import { describe, expect, it, vi } from 'vitest';
import { LinkedInPostgresStore, type LinkedInSqlPool } from '../apps/api/src/linkedin/postgres-store';
import type { EncryptedEnvelope, TenantEnvelopeCipher } from '../packages/cloud-core/src/encryption';

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


describe('LinkedInPostgresStore envelope rotation', () => {
  const baseEnvelope: EncryptedEnvelope = {
    algorithm: 'A256GCM',
    keyVersion: 'v1',
    wrappedKey: 'legacy-wrapped-key',
    iv: 'AAAAAAAAAAAAAAAA',
    authTag: 'AAAAAAAAAAAAAAAAAAAAAA==',
    ciphertext: 'AAAA',
    tenantId: 'tenant-1',
    context: 'linkedin-token:subject-1',
  };

  function rotationPool(options: {
    current?: EncryptedEnvelope;
    revision?: number;
  } = {}) {
    const statements: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        statements.push({ sql, values });
        if (sql.includes('SELECT token_envelope FROM linkedin_connections')) {
          return { rows: [{ token_envelope: baseEnvelope }] };
        }
        if (sql.includes('FROM linkedin_connection_envelope_revisions') && sql.includes('ORDER BY revision DESC')) {
          return options.current
            ? { rows: [{ revision: options.revision ?? 2, token_envelope: options.current }] }
            : { rows: [] };
        }
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn(),
    };
    const database = { connect: vi.fn(async () => client) } as unknown as LinkedInSqlPool;
    return { database, statements };
  }

  it('appends a KMS envelope revision without overwriting the legacy base envelope', async () => {
    const { database, statements } = rotationPool();
    const store = new LinkedInPostgresStore(database, {} as TenantEnvelopeCipher);
    const replacement: EncryptedEnvelope = {
      ...baseEnvelope,
      keyVersion: 'kms-v1',
      wrappedKey: 'kms-wrapped-key',
    };
    const reencrypt = vi.fn(async () => replacement);

    const result = await store.rotateTokenEnvelope({
      identity: { tenantId: 'tenant-1', subject: 'subject-1' },
      actorSubject: 'subject-1',
      targetKeyVersion: 'kms-v1',
      reencrypt,
    });

    expect(result).toBe('rotated');
    expect(reencrypt).toHaveBeenCalledWith(
      baseEnvelope,
      'tenant-1',
      'linkedin-token:subject-1'
    );
    const insert = statements.find((entry) =>
      entry.sql.includes('INSERT INTO linkedin_connection_envelope_revisions')
    );
    expect(insert?.values?.[2]).toBe(2);
    expect(insert?.values?.[4]).toBe('subject-1');
    expect(statements.some((entry) =>
      entry.sql.includes('UPDATE linkedin_connections') &&
      entry.sql.includes('token_envelope =')
    )).toBe(false);
  });

  it('is idempotent when the latest revision already uses the target key version', async () => {
    const current: EncryptedEnvelope = {
      ...baseEnvelope,
      keyVersion: 'kms-v1',
      wrappedKey: 'kms-wrapped-key',
    };
    const { database, statements } = rotationPool({ current, revision: 3 });
    const store = new LinkedInPostgresStore(database, {} as TenantEnvelopeCipher);
    const reencrypt = vi.fn(async () => current);

    const result = await store.rotateTokenEnvelope({
      identity: { tenantId: 'tenant-1', subject: 'subject-1' },
      actorSubject: 'subject-1',
      targetKeyVersion: 'kms-v1',
      reencrypt,
    });

    expect(result).toBe('already_current');
    expect(reencrypt).not.toHaveBeenCalled();
    expect(statements.some((entry) =>
      entry.sql.includes('INSERT INTO linkedin_connection_envelope_revisions')
    )).toBe(false);
  });

  it('rejects a rotation actor that does not match the subject RLS identity', async () => {
    const { database } = rotationPool();
    const store = new LinkedInPostgresStore(database, {} as TenantEnvelopeCipher);

    await expect(
      store.rotateTokenEnvelope({
        identity: { tenantId: 'tenant-1', subject: 'subject-1' },
        actorSubject: 'different-subject',
        targetKeyVersion: 'kms-v1',
        reencrypt: vi.fn(async () => baseEnvelope),
      })
    ).rejects.toThrow('Invalid LinkedIn token envelope rotation request');
  });
});
