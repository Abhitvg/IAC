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
      wrappedKey: 'a21zLXdyYXBwZWQta2V5',
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
    expect(statements.some((entry) =>
      entry.sql.includes('INSERT INTO audit_events')
    )).toBe(true);
  });

  it('is idempotent when the latest revision already uses the target key version', async () => {
    const current: EncryptedEnvelope = {
      ...baseEnvelope,
      keyVersion: 'kms-v1',
      wrappedKey: 'a21zLXdyYXBwZWQta2V5',
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

  it('decrypts the latest revision rather than the legacy base envelope', async () => {
    const latest: EncryptedEnvelope = {
      ...baseEnvelope,
      keyVersion: 'kms-v1',
      wrappedKey: 'bGF0ZXN0LWttcy13cmFwcGVkLWtleQ==',
    };
    const statements: string[] = [];
    const client = {
      query: vi.fn(async (sql: string) => {
        statements.push(sql);
        if (sql.includes('COALESCE(revision.token_envelope, connection.token_envelope)')) {
          return { rows: [{ token_envelope: latest }] };
        }
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn(),
    };
    const database = { connect: vi.fn(async () => client) } as unknown as LinkedInSqlPool;
    const tokens = {
      accessToken: 'latest-access-token',
      memberId: 'member_1',
      tokenType: 'Bearer' as const,
      grantedScopes: ['openid'],
      expiresAt: Date.now() + 60_000,
    };
    const cipher = {
      decrypt: vi.fn(async () => Buffer.from(JSON.stringify(tokens), 'utf8')),
    } as unknown as TenantEnvelopeCipher;
    const store = new LinkedInPostgresStore(database, cipher);

    await expect(
      store.get({ tenantId: 'tenant-1', subject: 'subject-1' })
    ).resolves.toEqual(tokens);

    expect(statements.some((sql) =>
      sql.includes('COALESCE(revision.token_envelope, connection.token_envelope)')
    )).toBe(true);
    expect(cipher.decrypt).toHaveBeenCalledWith(
      latest,
      'tenant-1',
      'linkedin-token:subject-1'
    );
  });

  it('appends subsequent OAuth token writes after an existing revision', async () => {
    const statements: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: vi.fn(async (sql: string, values?: unknown[]) => {
        statements.push({ sql, values });
        if (sql.includes('SELECT tenant_id FROM linkedin_connections')) {
          return { rows: [{ tenant_id: 'tenant-1' }] };
        }
        if (sql.includes('SELECT COALESCE(MAX(revision), 1) AS revision')) {
          return { rows: [{ revision: 2 }] };
        }
        return { rows: [], rowCount: 1 };
      }),
      release: vi.fn(),
    };
    const database = { connect: vi.fn(async () => client) } as unknown as LinkedInSqlPool;
    const encrypted: EncryptedEnvelope = {
      ...baseEnvelope,
      keyVersion: 'kms-v1',
      wrappedKey: 'bmV3LWttcy13cmFwcGVkLWtleQ==',
    };
    const cipher = {
      encrypt: vi.fn(async () => encrypted),
    } as unknown as TenantEnvelopeCipher;
    const store = new LinkedInPostgresStore(database, cipher);

    await store.put(
      { tenantId: 'tenant-1', subject: 'subject-1' },
      {
        accessToken: 'rotated-access-token',
        memberId: 'member_1',
        tokenType: 'Bearer',
        grantedScopes: ['openid', 'profile'],
        expiresAt: Date.now() + 120_000,
      }
    );

    const insert = statements.find((entry) =>
      entry.sql.includes('INSERT INTO linkedin_connection_envelope_revisions')
    );
    expect(insert?.values?.[2]).toBe(3);
    expect(statements.some((entry) =>
      entry.sql.includes('UPDATE linkedin_connections') &&
      entry.sql.includes('token_envelope =')
    )).toBe(false);
    expect(statements.some((entry) =>
      entry.sql.includes('UPDATE linkedin_connections') &&
      entry.sql.includes('granted_scopes =')
    )).toBe(true);
  });

  it.each([
    ['wrappedKey', 'not-base64'],
    ['iv', 'not-base64'],
    ['authTag', 'not-base64'],
    ['ciphertext', 'not-base64'],
  ] as const)(
    'rejects malformed %s before inserting a revision',
    async (field, invalidValue) => {
      const { database, statements } = rotationPool();
      const store = new LinkedInPostgresStore(database, {} as TenantEnvelopeCipher);
      const malformed = {
        ...baseEnvelope,
        keyVersion: 'kms-v1',
        wrappedKey: 'a21zLXdyYXBwZWQta2V5',
        [field]: invalidValue,
      } as EncryptedEnvelope;

      await expect(
        store.rotateTokenEnvelope({
          identity: { tenantId: 'tenant-1', subject: 'subject-1' },
          actorSubject: 'subject-1',
          targetKeyVersion: 'kms-v1',
          reencrypt: vi.fn(async () => malformed),
        })
      ).rejects.toThrow('LinkedIn token rotation returned an envelope with invalid metadata');

      expect(statements.some((entry) =>
        entry.sql.includes('INSERT INTO linkedin_connection_envelope_revisions')
      )).toBe(false);
      expect(statements.some((entry) =>
        entry.sql.includes('INSERT INTO audit_events')
      )).toBe(false);
      expect(statements.some((entry) => entry.sql === 'ROLLBACK')).toBe(true);
    }
  );

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
