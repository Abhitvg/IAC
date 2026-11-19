import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CareerGraphFact } from '../packages/cloud-core/src/career-graph';
import type { CloudApiDependencies } from '../apps/api/src/ports';
import { createCloudApiServer } from '../apps/api/src/server';
import { PostgresCareerGraphRepository } from '../apps/api/src/career-graph-repository';
import { TenantEnvelopeCipher } from '../packages/cloud-core/src/encryption';
import { MasterKeyTenantKeyProvider } from '../packages/cloud-core/src/master-key-provider';
import type { SqlPool } from '../apps/api/src/postgres-repository';

const tenantId = '10000000-0000-4000-8000-000000000001';
const factId = '20000000-0000-4000-8000-000000000002';
const subject = 'candidate:verified-subject';

const fact: CareerGraphFact = {
  id: factId,
  tenantId,
  factKey: 'profile.current_role',
  version: 1,
  valueEnvelope: {
    algorithm: 'A256GCM',
    keyVersion: 'test-key-v1',
    wrappedKey: 'wrapped-key',
    iv: 'AAAAAAAAAAAAAAAA',
    authTag: 'AAAAAAAAAAAAAAAAAAAAAA==',
    ciphertext: 'Y2lwaGVydGV4dA==',
    tenantId,
    context: 'career-graph:profile.current_role',
  },
  source: { kind: 'user_input' },
  createdBy: subject,
  createdAt: '2026-11-11T00:00:00.000Z',
  review: null,
};

const validRequest = {
  factKey: 'profile.current_role',
  value: 'Software Engineer',
  source: { kind: 'user_input' as const },
};

const validInput = {
  factKey: 'profile.current_role',
  valueEnvelope: fact.valueEnvelope,
  source: { kind: 'user_input' as const },
};

function createDependencies(): CloudApiDependencies {
  const createFact = vi.fn(async () => fact);
  const listFacts = vi.fn(async () => [fact]);
  const reviewFact = vi.fn(async () => ({
    ...fact,
    review: {
      decision: 'confirmed' as const,
      reviewedBy: subject,
      reviewedAt: '2026-11-11T00:01:00.000Z',
    },
  }));
  const dependencies: CloudApiDependencies = {
    config: {
      issuer: 'https://identity.example.test',
      audience: 'careerops-api',
      jwksUrl: 'https://identity.example.test/.well-known/jwks.json',
      consentSigningSecret: 'test-secret',
    },
    identityVerifier: {
      verify: async () => ({
        subject,
        issuer: 'https://identity.example.test',
        audience: ['careerops-api'],
        expiresAt: 2_000_000_000,
      }),
    },
    rateLimiter: { consume: async () => true },
    repository: {
      findMembershipsBySubject: async () => [
        { tenantId, subject, role: 'owner', status: 'active' },
      ],
      checkReady: async () => undefined,
      getControlState: async () => ({
        tenantId,
        globalKillSwitch: true,
        pausedChannels: [],
        updatedAt: '2026-11-11T00:00:00.000Z',
      }),
      acceptSprintContract: async () => ({ id: factId, revision: 1 }),
      getActiveSprintContract: async () => null,
      revokeSprintContract: async () => undefined,
      setChannelPauseWithAudit: async () => undefined,
      setGlobalKillSwitchWithAudit: async () => undefined,
    },
    careerGraph: { createFact, listFacts, reviewFact },
    careerGraphCrypto: {
      encrypt: async () => fact.valueEnvelope,
      decrypt: async () => Buffer.from(JSON.stringify('Software Engineer')),
    },
  };
  return dependencies;
}

describe('Career Graph API routes', () => {
  let server: ReturnType<typeof createCloudApiServer> | undefined;
  let baseUrl: string;

  afterEach(async () => {
    if (server?.listening) {
      server.close();
      await once(server, 'close');
    }
    server = undefined;
  });

  async function startServer() {
    const dependencies = createDependencies();
    server = createCloudApiServer(dependencies);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    baseUrl = `http://127.0.0.1:${address.port}`;
    return dependencies;
  }

  it('binds fact creation to verified tenant and actor', async () => {
    const dependencies = await startServer();
    const headers = {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
    };

    const forged = await fetch(`${baseUrl}/v1/career-graph/facts`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ ...validRequest, tenantId: '30000000-0000-4000-8000-000000000003' }),
    });
    expect(forged.status).toBe(400);
    expect(dependencies.careerGraph.createFact).not.toHaveBeenCalled();

    const created = await fetch(`${baseUrl}/v1/career-graph/facts`, {
      method: 'POST',
      headers,
      body: JSON.stringify(validRequest),
    });
    expect(created.status).toBe(201);
    expect(dependencies.careerGraph.createFact).toHaveBeenCalledWith(tenantId, subject, {
      factKey: validRequest.factKey,
      valueEnvelope: fact.valueEnvelope,
      source: validRequest.source,
    });

    const listed = await fetch(`${baseUrl}/v1/career-graph/facts?limit=25`, {
      headers: { authorization: 'Bearer test-token' },
    });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({ facts: [{ id: factId, tenantId }] });

    const invalidLimit = await fetch(`${baseUrl}/v1/career-graph/facts?limit=1000`, {
      headers: { authorization: 'Bearer test-token' },
    });
    expect(invalidLimit.status).toBe(400);
  });

  it('fails closed when Career Graph encryption is unavailable', async () => {
    const dependencies = await startServer();
    dependencies.careerGraphCrypto = undefined;
    const headers = {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
    };
    const created = await fetch(`${baseUrl}/v1/career-graph/facts`, {
      method: 'POST',
      headers,
      body: JSON.stringify(validRequest),
    });
    expect(created.status).toBe(503);
    expect(dependencies.careerGraph.createFact).not.toHaveBeenCalled();

    const listed = await fetch(`${baseUrl}/v1/career-graph/facts`, {
      headers: { authorization: 'Bearer test-token' },
    });
    expect(listed.status).toBe(503);
    expect(dependencies.careerGraph.listFacts).not.toHaveBeenCalled();
  });

  it('encrypts submitted values and returns decrypted tenant-authorized facts', async () => {
    const dependencies = await startServer();
    const provider = new MasterKeyTenantKeyProvider({
      masterKeys: { 'test-key-v1': Buffer.alloc(32, 7).toString('base64') },
      currentKeyVersion: 'test-key-v1',
    });
    const cipher = new TenantEnvelopeCipher(provider);
    dependencies.careerGraphCrypto = cipher;
    vi.mocked(dependencies.careerGraph.createFact).mockImplementation(
      async (_tenant, _actor, input) => ({
        ...fact,
        valueEnvelope: input.valueEnvelope,
      })
    );
    dependencies.careerGraph.listFacts = vi.fn(async () => [
      {
        ...fact,
        valueEnvelope: await cipher.encrypt(
          tenantId,
          'career-graph:profile.current_role',
          Buffer.from(JSON.stringify('Software Engineer'))
        ),
      },
    ]);

    const headers = {
      authorization: 'Bearer test-token',
      'content-type': 'application/json',
    };
    const created = await fetch(`${baseUrl}/v1/career-graph/facts`, {
      method: 'POST',
      headers,
      body: JSON.stringify(validRequest),
    });
    expect(created.status).toBe(201);
    const createdPayload = await created.json();
    expect(createdPayload).toMatchObject({
      fact: { factKey: 'profile.current_role', value: 'Software Engineer' },
    });
    expect(createdPayload.fact).not.toHaveProperty('valueEnvelope');

    const storedInput = vi.mocked(dependencies.careerGraph.createFact).mock.calls[0]?.[2];
    expect(storedInput?.valueEnvelope).toMatchObject({
      algorithm: 'A256GCM',
      tenantId,
      context: 'career-graph:profile.current_role',
    });
    expect(storedInput?.valueEnvelope.ciphertext).not.toContain('Software Engineer');

    const listed = await fetch(`${baseUrl}/v1/career-graph/facts`, {
      headers: { authorization: 'Bearer test-token' },
    });
    expect(listed.status).toBe(200);
    expect(await listed.json()).toMatchObject({
      facts: [{ factKey: 'profile.current_role', value: 'Software Engineer' }],
    });

    const corrupted = {
      ...storedInput!.valueEnvelope,
      authTag: Buffer.alloc(16, 0).toString('base64'),
    };
    await expect(
      cipher.decrypt(corrupted, tenantId, 'career-graph:profile.current_role')
    ).rejects.toThrow();
    provider.destroy();
  });

  it('routes confirmation through the authenticated contributor identity', async () => {
    const dependencies = await startServer();
    const response = await fetch(`${baseUrl}/v1/career-graph/facts/${factId}/review`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer test-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ decision: 'confirmed' }),
    });
    expect(response.status).toBe(200);
    expect(dependencies.careerGraph.reviewFact).toHaveBeenCalledWith(tenantId, subject, factId, {
      decision: 'confirmed',
    });
    expect(await response.json()).toMatchObject({
      fact: { id: factId, review: { decision: 'confirmed', reviewedBy: subject } },
    });
  });
});

describe('Postgres Career Graph repository', () => {
  it('locks fact version allocation and audits atomically', async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('COALESCE(MAX(version)')) return { rows: [{ next_version: 1 }] };
        if (sql.includes('INSERT INTO career_graph_facts')) {
          return { rows: [{ id: factId }], rowCount: 1 };
        }
        if (sql.includes('SELECT event_hash')) return { rows: [] };
        if (sql.includes('FROM career_graph_facts f')) {
          return {
            rows: [
              {
                id: factId,
                tenant_id: tenantId,
                fact_key: 'profile.current_role',
                version: 1,
                value_envelope: fact.valueEnvelope,
                source_kind: 'user_input',
                source_reference: null,
                evidence_sha256: null,
                created_by: subject,
                created_at: '2026-11-11T00:00:00.000Z',
                decision: null,
                reason: null,
                reviewed_by: null,
                reviewed_at: null,
              },
            ],
          };
        }
        return { rows: [], rowCount: 1 };
      },
      release: () => statements.push('RELEASE'),
    };
    const pool = { connect: async () => client } as unknown as SqlPool;
    const repository = new PostgresCareerGraphRepository(pool);
    const created = await repository.createFact(tenantId, subject, validInput);

    expect(created).toMatchObject({
      id: factId,
      tenantId,
      factKey: 'profile.current_role',
      version: 1,
    });
    const factLock = statements.findIndex((sql) => sql.includes('pg_advisory_xact_lock'));
    const allocateVersion = statements.findIndex((sql) => sql.includes('COALESCE(MAX(version)'));
    const insertFact = statements.findIndex((sql) =>
      sql.includes('INSERT INTO career_graph_facts')
    );
    const insertAudit = statements.findIndex((sql) => sql.includes('INSERT INTO audit_events'));
    expect(factLock).toBeGreaterThan(-1);
    expect(factLock).toBeLessThan(allocateVersion);
    expect(allocateVersion).toBeLessThan(insertFact);
    expect(insertAudit).toBeGreaterThan(insertFact);
    expect(statements.indexOf('COMMIT')).toBeGreaterThan(insertAudit);
    expect(statements.at(-1)).toBe('RELEASE');
  });

  it('rolls back a review attempt by anyone other than the fact contributor', async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('FROM career_graph_facts f')) {
          return {
            rows: [
              {
                id: factId,
                tenant_id: tenantId,
                fact_key: 'profile.current_role',
                version: 1,
                value_envelope: fact.valueEnvelope,
                source_kind: 'user_input',
                source_reference: null,
                evidence_sha256: null,
                created_by: 'another-user',
                created_at: '2026-11-11T00:00:00.000Z',
                decision: null,
                reason: null,
                reviewed_by: null,
                reviewed_at: null,
              },
            ],
          };
        }
        return { rows: [], rowCount: 1 };
      },
      release: () => statements.push('RELEASE'),
    };
    const pool = { connect: async () => client } as unknown as SqlPool;
    const repository = new PostgresCareerGraphRepository(pool);

    await expect(
      repository.reviewFact(tenantId, subject, factId, { decision: 'confirmed' })
    ).rejects.toThrow('Only the fact contributor');
    expect(statements.some((sql) => sql.includes('INSERT INTO career_graph_fact_reviews'))).toBe(
      false
    );
    expect(statements).toContain('ROLLBACK');
    expect(statements.at(-1)).toBe('RELEASE');
  });
}
  it('rotates bounded tenant facts by appending resumable envelope revisions', async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        statements.push(sql);
        if (sql.includes('SELECT last_fact_id, rotated_count, status')) {
          return {
            rows: [{ last_fact_id: null, rotated_count: 0, status: 'running' }],
            rowCount: 1,
          };
        }
        if (sql.includes('SELECT f.id, f.fact_key')) {
          return {
            rows: [
              {
                id: factId,
                fact_key: 'profile.current_role',
                value_envelope: fact.valueEnvelope,
              },
            ],
            rowCount: 1,
          };
        }
        if (sql.includes('COALESCE(MAX(revision), 1)')) {
          return { rows: [{ next_revision: 2 }], rowCount: 1 };
        }
        if (sql.includes('UPDATE career_graph_envelope_rotation_jobs')) {
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('INSERT INTO career_graph_fact_envelope_revisions')) {
          expect(values?.[2]).toBe(2);
          expect(JSON.parse(String(values?.[3])).keyVersion).toBe('test-key-v2');
          return { rows: [], rowCount: 1 };
        }
        if (sql.includes('SELECT event_hash')) return { rows: [] };
        return { rows: [], rowCount: 1 };
      },
      release: () => statements.push('RELEASE'),
    };
    const pool = { connect: async () => client } as unknown as SqlPool;
    const repository = new PostgresCareerGraphRepository(pool);
    const reencrypt = vi.fn(async (envelope: typeof fact.valueEnvelope) => ({
      ...envelope,
      keyVersion: 'test-key-v2',
      wrappedKey: 'd3JhcHBlZC1rZXktdjI=',
    }));

    const result = await repository.rotateEnvelopeBatch({
      tenantId,
      actorSubject: subject,
      targetKeyVersion: 'test-key-v2',
      limit: 10,
      reencrypt,
    });

    expect(result).toEqual({ rotated: 1, nextCursor: factId, hasMore: false });
    expect(reencrypt).toHaveBeenCalledWith(
      fact.valueEnvelope,
      tenantId,
      'career-graph:profile.current_role'
    );
    expect(statements.some((sql) => sql.includes('career_graph_fact_envelope_revisions'))).toBe(
      true
    );
    const tenantAuditLock = statements.findIndex((sql) =>
      sql.includes('pg_advisory_xact_lock')
    );
    const candidateLock = statements.findIndex((sql) => sql.includes('SELECT f.id, f.fact_key'));
    expect(tenantAuditLock).toBeGreaterThan(-1);
    expect(tenantAuditLock).toBeLessThan(candidateLock);
    expect(statements).toContain('COMMIT');
    expect(statements.at(-1)).toBe('RELEASE');
  });

  it('rolls back the entire rotation batch when re-encryption fails', async () => {
    const statements: string[] = [];
    const client = {
      query: async (sql: string) => {
        statements.push(sql);
        if (sql.includes('SELECT last_fact_id, rotated_count, status')) {
          return {
            rows: [{ last_fact_id: null, rotated_count: 0, status: 'running' }],
            rowCount: 1,
          };
        }
        if (sql.includes('SELECT f.id, f.fact_key')) {
          return {
            rows: [
              {
                id: factId,
                fact_key: 'profile.current_role',
                value_envelope: fact.valueEnvelope,
              },
            ],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 };
      },
      release: () => statements.push('RELEASE'),
    };
    const pool = { connect: async () => client } as unknown as SqlPool;
    const repository = new PostgresCareerGraphRepository(pool);

    await expect(
      repository.rotateEnvelopeBatch({
        tenantId,
        actorSubject: subject,
        targetKeyVersion: 'test-key-v2',
        limit: 10,
        reencrypt: async () => {
          throw new Error('old key unavailable');
        },
      })
    ).rejects.toThrow('old key unavailable');

    expect(statements).toContain('ROLLBACK');
    expect(statements).not.toContain('COMMIT');
    expect(statements.at(-1)).toBe('RELEASE');
  });
});
