import { createHmac, generateKeyPairSync, randomBytes, sign as signJwt } from 'node:crypto';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { OidcJwksVerifier, verifyAccessToken } from '../packages/cloud-core/src/auth';
import {
  createConsentRecord,
  SprintContractSchema,
  verifyConsentRecord,
} from '../packages/cloud-core/src/contract';
import { assertActionAllowed, type TenantControlState } from '../packages/cloud-core/src/controls';
import {
  appendAuditEvent,
  hashAuditEvent,
  type AuditRecord,
} from '../packages/cloud-core/src/audit';
import {
  TenantEnvelopeCipher,
  type TenantKeyManagementService,
} from '../packages/cloud-core/src/encryption';
import { resolveTenantContext, type TenantMembership } from '../packages/cloud-core/src/tenant';
import { createCloudApiServer } from '../apps/api/src/server';
import { loadCloudEnvironment } from '../apps/api/src/config';
import type { CloudApiDependencies } from '../apps/api/src/ports';
import {
  PostgresCloudApiRepository,
  type ClosableSqlPool,
  type SqlPool,
} from '../apps/api/src/postgres-repository';
import { PostgresCloudRateLimiter } from '../apps/api/src/postgres-rate-limiter';
import { createCloudApiRuntime } from '../apps/api/src/runtime';

const secret = 'test-only-secret-that-is-at-least-32-characters';
const rateSecret = 'test-only-rate-limit-secret-that-is-different';
const contractInput = {
  version: 1 as const,
  roles: ['Software Engineer'],
  seniority: ['mid' as const],
  locations: ['India'],
  remotePreference: 'any' as const,
  salaryFloor: { amount: 0, currency: 'INR' },
  workAuthorization: { countries: ['IN'], requiresSponsorship: false, confirmed: true as const },
  blocklist: { companies: [], industries: [] },
  enabledChannels: ['ats', 'email', 'calendar'] as const,
  dailyCaps: { applications: 10, emails: 5, assistQueueItems: 0, calendarEvents: 5 },
  defaultAnswers: {},
  allowedFactIds: [],
  tone: 'professional' as const,
  senderIdentity: { name: 'Test User', email: 'test@example.com' },
  jurisdiction: ['IN'] as const,
  outreachConsent: true,
  consentTextVersion: '2026-01',
  startsAt: '2026-11-11T00:00:00.000Z',
  endsAt: '2026-11-15T00:00:00.000Z',
};

function signToken(claims: Record<string, unknown>, signingSecret = secret): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const content = `${header}.${payload}`;
  const signature = createHmac('sha256', signingSecret).update(content).digest('base64url');
  return `${content}.${signature}`;
}

const authConfig = {
  issuer: 'https://identity.example.test',
  audience: 'careerops-api',
  jwksUrl: 'https://identity.example.test/.well-known/jwks.json',
};

describe('PostgreSQL shared rate limiter', () => {
  it('atomically counts fixed-window requests without storing raw caller keys', async () => {
    const statements: Array<{ sql: string; values?: unknown[] }> = [];
    let count = 0;
    let windowStart: Date | null = null;
    const pool = {
      connect: async () => ({
        query: async (sql: string, values?: unknown[]) => {
          statements.push({ sql, values });
          if (sql.includes('INSERT INTO api_rate_limit_buckets')) {
            const incomingWindow = values?.[1] as Date;
            count = windowStart?.getTime() === incomingWindow.getTime() ? count + 1 : 1;
            windowStart = incomingWindow;
            return { rows: [{ request_count: count }] };
          }
          return { rows: [] };
        },
        release: () => undefined,
      }),
    } as unknown as SqlPool;
    let now = Date.parse('2026-11-11T10:00:10.000Z');
    const limiter = new PostgresCloudRateLimiter(pool, rateSecret, () => now);

    expect(await limiter.consume('ip:203.0.113.10', 2, 60_000)).toBe(true);
    expect(await limiter.consume('ip:203.0.113.10', 2, 60_000)).toBe(true);
    expect(await limiter.consume('ip:203.0.113.10', 2, 60_000)).toBe(false);

    const bucketInsert = statements.find((item) =>
      item.sql.includes('INSERT INTO api_rate_limit_buckets')
    );
    expect(bucketInsert?.values?.[0]).toMatch(/^[a-f0-9]{64}$/);
    expect(bucketInsert?.values?.[0]).not.toContain('203.0.113.10');

    now += 60_000;
    expect(await limiter.consume('ip:203.0.113.10', 2, 60_000)).toBe(true);
    expect(count).toBe(1);
    expect(statements.some((item) => item.sql.includes('ON CONFLICT (bucket_key) DO UPDATE'))).toBe(
      true
    );
  });

  it('fails closed and rolls back when PostgreSQL rate-limit storage is unavailable', async () => {
    let rolledBack = false;
    let released = false;
    const pool = {
      connect: async () => ({
        query: async (sql: string) => {
          if (sql === 'ROLLBACK') rolledBack = true;
          if (sql.includes('INSERT INTO api_rate_limit_buckets')) {
            throw new Error('database unavailable');
          }
          return { rows: [] };
        },
        release: () => {
          released = true;
        },
      }),
    } as unknown as SqlPool;
    const limiter = new PostgresCloudRateLimiter(pool, rateSecret);
    await expect(limiter.consume('ip:test', 10, 60_000)).rejects.toThrow('database unavailable');
    expect(rolledBack).toBe(true);
    expect(released).toBe(true);
  });

  it('rejects weak secrets and invalid rate-limit parameters', async () => {
    const pool = {
      connect: async () => {
        throw new Error('should not connect');
      },
    } as unknown as SqlPool;
    expect(() => new PostgresCloudRateLimiter(pool, 'too-short')).toThrow();
    const limiter = new PostgresCloudRateLimiter(pool, rateSecret);
    await expect(limiter.consume('', 1, 1000)).rejects.toThrow();
    await expect(limiter.consume('ip:test', 0, 1000)).rejects.toThrow();
    await expect(limiter.consume('ip:test', 1, 0)).rejects.toThrow();
  });
});

describe('cloud API runtime composition', () => {
  it('composes PostgreSQL adapters and supports graceful listener/pool shutdown', async () => {
    let released = 0;
    let ended = 0;
    const pool = {
      connect: async () => ({
        query: async () => ({ rows: [{ '?column?': 1 }] }),
        release: () => {
          released += 1;
        },
      }),
      end: async () => {
        ended += 1;
      },
    } as unknown as ClosableSqlPool;
    const environment = loadCloudEnvironment({
      NODE_ENV: 'test',
      CAREEROPS_JWT_ISSUER: authConfig.issuer,
      CAREEROPS_JWT_AUDIENCE: authConfig.audience,
      CAREEROPS_JWKS_URL: authConfig.jwksUrl,
      CAREEROPS_CONSENT_SIGNING_SECRET: secret,
      CAREEROPS_RATE_LIMIT_HASH_SECRET: rateSecret,
    } as NodeJS.ProcessEnv);
    const runtime = createCloudApiRuntime(pool, environment);
    await runtime.listen(0, '127.0.0.1');
    const address = runtime.server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    const ready = await fetch(`http://127.0.0.1:${address.port}/health/ready`);
    expect(ready.status).toBe(200);
    await runtime.close();
    await runtime.close();
    expect(released).toBe(1);
    expect(ended).toBe(1);
    expect(() => runtime.listen(8080)).toThrow('already closed');
  });
});

describe('M0 cloud security foundation', () => {
  it('requires NODE_ENV instead of silently defaulting cloud runtime to development', () => {
    expect(() =>
      loadCloudEnvironment({
        CAREEROPS_JWT_ISSUER: authConfig.issuer,
        CAREEROPS_JWT_AUDIENCE: authConfig.audience,
        CAREEROPS_JWKS_URL: authConfig.jwksUrl,
        CAREEROPS_CONSENT_SIGNING_SECRET: secret,
        CAREEROPS_RATE_LIMIT_HASH_SECRET: rateSecret,
      } as NodeJS.ProcessEnv)
    ).toThrow();
  });

  it('requires HTTPS issuer/JWKS endpoints and a separate consent signing secret', () => {
    expect(() =>
      loadCloudEnvironment({
        NODE_ENV: 'test',
        CAREEROPS_JWT_ISSUER: 'http://identity.example.test',
        CAREEROPS_JWT_AUDIENCE: 'careerops-api',
        CAREEROPS_JWKS_URL: 'https://identity.example.test/.well-known/jwks.json',
        CAREEROPS_CONSENT_SIGNING_SECRET: secret,
        CAREEROPS_RATE_LIMIT_HASH_SECRET: rateSecret,
      } as NodeJS.ProcessEnv)
    ).toThrow();
    expect(() =>
      loadCloudEnvironment({
        NODE_ENV: 'test',
        CAREEROPS_JWT_ISSUER: 'https://identity.example.test',
        CAREEROPS_JWT_AUDIENCE: 'careerops-api',
        CAREEROPS_JWKS_URL: 'https://identity.example.test/.well-known/jwks.json',
        CAREEROPS_CONSENT_SIGNING_SECRET: 'short',
        CAREEROPS_RATE_LIMIT_HASH_SECRET: rateSecret,
      } as NodeJS.ProcessEnv)
    ).toThrow();
    expect(() =>
      loadCloudEnvironment({
        NODE_ENV: 'test',
        CAREEROPS_JWT_ISSUER: 'https://identity.example.test',
        CAREEROPS_JWT_AUDIENCE: 'careerops-api',
        CAREEROPS_JWKS_URL: 'https://identity.example.test/.well-known/jwks.json',
        CAREEROPS_CONSENT_SIGNING_SECRET: secret,
        CAREEROPS_RATE_LIMIT_HASH_SECRET: secret,
      } as NodeJS.ProcessEnv)
    ).toThrow(/different from the consent signing secret/);
  });
  it('keeps the HS256 verifier available only as a deterministic test adapter', () => {
    const claims = {
      sub: 'user-1',
      iss: authConfig.issuer,
      aud: authConfig.audience,
      exp: 2_000_000_000,
    };
    const validToken = signToken(claims);
    expect(
      verifyAccessToken(
        validToken,
        {
          issuer: authConfig.issuer,
          audience: authConfig.audience,
          hmacSecret: secret,
        },
        1_900_000_000
      ).subject
    ).toBe('user-1');
    expect(() =>
      verifyAccessToken(
        `${validToken}!`,
        {
          issuer: authConfig.issuer,
          audience: authConfig.audience,
          hmacSecret: secret,
        },
        1_900_000_000
      )
    ).toThrow();
    expect(() =>
      verifyAccessToken(
        signToken({ ...claims, aud: 'other' }),
        {
          issuer: authConfig.issuer,
          audience: authConfig.audience,
          hmacSecret: secret,
        },
        1_900_000_000
      )
    ).toThrow();
  });

  it('verifies RS256 OIDC tokens against pinned JWKS and rejects invalid claims/signatures', async () => {
    const pair = generateKeyPairSync('rsa', { modulusLength: 2048 });
    const jwk = pair.publicKey.export({ format: 'jwk' });
    const fetcher = async () =>
      new Response(
        JSON.stringify({
          keys: [{ ...jwk, kid: 'key-1', alg: 'RS256', use: 'sig' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      );
    const verifier = new OidcJwksVerifier(
      {
        issuer: authConfig.issuer,
        audience: authConfig.audience,
        jwksUrl: authConfig.jwksUrl,
      },
      fetcher as typeof fetch
    );
    const claims = {
      sub: 'user-oidc',
      iss: authConfig.issuer,
      aud: authConfig.audience,
      exp: 2_000_000_000,
    };
    const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT', kid: 'key-1' })).toString(
      'base64url'
    );
    const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
    const input = `${header}.${payload}`;
    const token = `${input}.${signJwt('RSA-SHA256', Buffer.from(input), pair.privateKey).toString('base64url')}`;
    expect((await verifier.verify(token, 1_900_000_000)).subject).toBe('user-oidc');
    const [headerPart, payloadPart, signaturePart] = token.split('.');
    await expect(
      verifier.verify(`${headerPart}.${payloadPart}.${signaturePart}!`, 1_900_000_000)
    ).rejects.toThrow();
    await expect(
      verifier.verify(`${headerPart}=.${payloadPart}.${signaturePart}`, 1_900_000_000)
    ).rejects.toThrow();

    const signClaims = (nextClaims: Record<string, unknown>) => {
      const nextPayload = Buffer.from(JSON.stringify(nextClaims)).toString('base64url');
      const nextInput = `${header}.${nextPayload}`;
      return `${nextInput}.${signJwt('RSA-SHA256', Buffer.from(nextInput), pair.privateKey).toString('base64url')}`;
    };
    const multiAudience = signClaims({
      ...claims,
      aud: [authConfig.audience, 'another-client'],
      azp: authConfig.audience,
    });
    expect((await verifier.verify(multiAudience, 1_900_000_000)).audience).toHaveLength(2);
    await expect(
      verifier.verify(
        signClaims({ ...claims, aud: [authConfig.audience, 'another-client'] }),
        1_900_000_000
      )
    ).rejects.toThrow('authorized party');
    await expect(
      verifier.verify(
        signClaims({
          ...claims,
          aud: [authConfig.audience, 'another-client'],
          azp: 'another-client',
        }),
        1_900_000_000
      )
    ).rejects.toThrow('authorized party');
    const [
      tamperedHeaderPart,
      tamperedPayloadPart,
      tamperedSignaturePart,
    ] = token.split('.');
    const tamperedSignature = `${signaturePart[0] === 'A' ? 'B' : 'A'}${signaturePart.slice(1)}`;
    await expect(
      verifier.verify(`${tamperedHeaderPart}.${tamperedPayloadPart}.${tamperedSignature}`, 1_900_000_000)
    ).rejects.toThrow();
    const wrongIssuer = Buffer.from(
      JSON.stringify({ ...claims, iss: 'https://attacker.test' })
    ).toString('base64url');
    const wrongInput = `${header}.${wrongIssuer}`;
    const wrongToken = `${wrongInput}.${signJwt('RSA-SHA256', Buffer.from(wrongInput), pair.privateKey).toString('base64url')}`;
    await expect(verifier.verify(wrongToken, 1_900_000_000)).rejects.toThrow('claims');
  });

  it('never trusts tenant IDs in JWT claims and resolves exactly one server-side membership', async () => {
    const membership: TenantMembership = {
      tenantId: '10000000-0000-4000-8000-000000000001',
      subject: 'user-1',
      role: 'owner',
      status: 'active',
    };
    const context = await resolveTenantContext('user-1', {
      findMembershipsBySubject: async () => [membership],
    });
    expect(context.tenantId).toBe('10000000-0000-4000-8000-000000000001');
    const memberships = [
      membership,
      { ...membership, tenantId: '20000000-0000-4000-8000-000000000002', role: 'member' as const },
    ];
    await expect(
      resolveTenantContext('user-1', { findMembershipsBySubject: async () => memberships })
    ).rejects.toThrow('multiple tenant memberships');
    await expect(
      resolveTenantContext(
        'user-1',
        { findMembershipsBySubject: async () => memberships },
        '20000000-0000-4000-8000-000000000002'
      )
    ).resolves.toMatchObject({ tenantId: '20000000-0000-4000-8000-000000000002', role: 'member' });
    await expect(
      resolveTenantContext(
        'user-1',
        { findMembershipsBySubject: async () => memberships },
        '30000000-0000-4000-8000-000000000003'
      )
    ).rejects.toThrow('selected tenant');
  });

  it('validates Sprint Contract and requires explicit outreach consent for email', () => {
    expect(SprintContractSchema.safeParse(contractInput).success).toBe(true);
    expect(
      SprintContractSchema.safeParse({
        ...contractInput,
        outreachConsent: false,
      }).success
    ).toBe(false);
    expect(
      SprintContractSchema.safeParse({
        ...contractInput,
        dailyCaps: { applications: 1000, emails: 5, assistQueueItems: 0, calendarEvents: 5 },
      }).success
    ).toBe(false);
    const factId = '30000000-0000-4000-8000-000000000003';
    const answer = {
      answer: 'I am authorized to work in India',
      confirmedFactIds: [factId],
    };
    expect(
      SprintContractSchema.safeParse({
        ...contractInput,
        defaultAnswers: { work_authorization: answer },
        allowedFactIds: [],
      }).success
    ).toBe(false);
    expect(
      SprintContractSchema.safeParse({
        ...contractInput,
        defaultAnswers: { work_authorization: answer },
        allowedFactIds: [factId],
      }).success
    ).toBe(true);
  });

  it('signs a validated consent record and preserves the contract hash', () => {
    const record = createConsentRecord('tenant-1', 'user-1', contractInput, secret);
    expect(record.signature).toMatch(/^[a-f0-9]{64}$/);
    expect(record.contractHash).toMatch(/^[a-f0-9]{64}$/);
    expect(record.revokedAt).toBeNull();
    expect(verifyConsentRecord(record, secret)).toBe(true);
    const reorderedContract = Object.fromEntries(
      Object.entries(record.contract).reverse()
    ) as typeof record.contract;
    expect(verifyConsentRecord({ ...record, contract: reorderedContract }, secret)).toBe(true);
    expect(
      verifyConsentRecord({ ...record, tenantId: '20000000-0000-4000-8000-000000000002' }, secret)
    ).toBe(false);
  });

  it('fails closed on global kill switch, channel pause, missing consent and expired contract', () => {
    const record = createConsentRecord('tenant-1', 'user-1', contractInput, secret);
    const base: TenantControlState = {
      tenantId: 'tenant-1',
      globalKillSwitch: false,
      pausedChannels: [],
      updatedAt: new Date().toISOString(),
    };
    const request = {
      tenantId: 'tenant-1',
      channel: 'email' as const,
      action: 'send',
      dailyUsage: 0,
      now: new Date('2026-11-12T00:00:00Z'),
    };
    expect(() =>
      assertActionAllowed(record, base, { ...request, subject: 'user-1' }, secret)
    ).not.toThrow();
    expect(() =>
      assertActionAllowed(
        record,
        { ...base, globalKillSwitch: true },
        { ...request, subject: 'user-1' },
        secret
      )
    ).toThrow('globally paused');
    expect(() =>
      assertActionAllowed(
        record,
        { ...base, pausedChannels: ['email'] },
        { ...request, subject: 'user-1' },
        secret
      )
    ).toThrow('channel is paused');
    expect(() =>
      assertActionAllowed(null, base, { ...request, subject: 'user-1' }, secret)
    ).toThrow('Sprint Contract');
    expect(() =>
      assertActionAllowed(record, base, { ...request, subject: 'user-1', dailyUsage: 5 }, secret)
    ).toThrow('Daily action cap');
    expect(() =>
      assertActionAllowed(
        { ...record, revokedAt: new Date().toISOString() },
        base,
        { ...request, subject: 'user-1' },
        secret
      )
    ).toThrow('valid, unrevoked');
    expect(() =>
      assertActionAllowed(record, base, { ...request, subject: 'other-user' }, secret)
    ).toThrow('identity mismatch');
    expect(() =>
      assertActionAllowed(
        record,
        base,
        { ...request, channel: 'calendar', subject: 'user-1', dailyUsage: 5 },
        secret
      )
    ).toThrow('Daily action cap');
  });

  it('creates a tamper-evident audit hash chain and appends records', async () => {
    const records: AuditRecord[] = [];
    const input = {
      tenantId: 'tenant-1',
      actorSubject: 'user-1',
      action: 'kill_switch.enabled',
      entityType: 'tenant_control',
      entityId: 'tenant-1',
      occurredAt: '2026-11-11T00:00:00.000Z',
      metadata: { enabled: true },
    };
    const first = await appendAuditEvent(
      {
        append: async (record) => {
          records.push(record);
        },
      },
      input,
      null
    );
    const second = await appendAuditEvent(
      {
        append: async (record) => {
          records.push(record);
        },
      },
      { ...input, action: 'kill_switch.disabled' },
      first.eventHash
    );
    expect(second.previousHash).toBe(first.eventHash);
    expect(records).toHaveLength(2);
    expect(hashAuditEvent(input, null)).toBe(first.eventHash);
    expect(hashAuditEvent({ ...input, metadata: { enabled: false } }, null)).not.toBe(
      first.eventHash
    );
  });

  it('encrypts with tenant/context binding and rejects cross-tenant or modified ciphertext', async () => {
    const keys = new Map<string, Buffer>();
    const kms: TenantKeyManagementService = {
      generateDataKey: async (tenantId, context) => {
        const key = randomBytes(32);
        const id = `${tenantId}|${context}`;
        keys.set(id, Buffer.from(key));
        return {
          plaintextKey: key,
          wrappedKey: Buffer.from(id).toString('base64'),
          keyVersion: 'test-kek-v1',
        };
      },
      unwrapDataKey: async (tenantId, wrappedKey, _version, context) => {
        const id = Buffer.from(wrappedKey, 'base64').toString('utf8');
        if (id !== `${tenantId}|${context}`) throw new Error('KMS context mismatch');
        return Buffer.from(keys.get(id)!);
      },
    };
    const cipher = new TenantEnvelopeCipher(kms);
    const envelope = await cipher.encrypt('tenant-1', 'resume:abc', Buffer.from('private resume'));
    expect((await cipher.decrypt(envelope, 'tenant-1', 'resume:abc')).toString()).toBe(
      'private resume'
    );
    await expect(cipher.decrypt(envelope, 'tenant-2', 'resume:abc')).rejects.toThrow('mismatch');
    await expect(
      cipher.decrypt(
        { ...envelope, ciphertext: Buffer.from('tampered').toString('base64') },
        'tenant-1',
        'resume:abc'
      )
    ).rejects.toThrow();
  });

  it('scopes PostgreSQL membership lookup to the verified subject in a transaction', async () => {
    const statements: string[] = [];
    const pool = {
      connect: async () => ({
        query: async (sql: string) => {
          statements.push(sql);
          return {
            rows: [{ tenant_id: 'tenant-1', subject: 'user-1', role: 'owner', status: 'active' }],
          };
        },
        release: () => statements.push('RELEASE'),
      }),
    } as unknown as SqlPool;
    const repository = new PostgresCloudApiRepository(pool);
    const memberships = await repository.findMembershipsBySubject('user-1');
    expect(memberships[0]).toMatchObject({ tenantId: 'tenant-1', subject: 'user-1' });
    expect(statements[0]).toBe('BEGIN');
    expect(statements[1]).toContain("set_config('app.user_subject'");
    expect(statements.some((sql) => sql.includes('FROM tenant_memberships'))).toBe(true);
    expect(statements).toContain('COMMIT');
    expect(statements.at(-1)).toBe('RELEASE');
  });

  it('commits kill-switch state and its append-only audit record in the same tenant transaction', async () => {
    const statements: string[] = [];
    const pool = {
      connect: async () => ({
        query: async (sql: string) => {
          statements.push(sql);
          if (sql.includes('UPDATE tenant_controls')) return { rows: [], rowCount: 1 };
          if (sql.includes('SELECT event_hash')) return { rows: [] };
          return { rows: [], rowCount: 1 };
        },
        release: () => statements.push('RELEASE'),
      }),
    } as unknown as SqlPool;
    const repository = new PostgresCloudApiRepository(pool);
    await repository.setGlobalKillSwitchWithAudit({
      tenantId: 'tenant-1',
      actorSubject: 'user-1',
      enabled: true,
      occurredAt: '2026-11-11T00:00:00.000Z',
      metadata: { enabled: true, requestId: 'req-1' },
    });
    expect(statements.some((sql) => sql.includes("set_config('app.tenant_id'"))).toBe(true);
    expect(statements.some((sql) => sql.includes('pg_advisory_xact_lock'))).toBe(true);
    expect(statements.some((sql) => sql.includes('INSERT INTO audit_events'))).toBe(true);
    expect(statements.indexOf('BEGIN')).toBe(0);
    expect(statements.indexOf('COMMIT')).toBeGreaterThan(
      statements.findIndex((sql) => sql.includes('INSERT INTO audit_events'))
    );
  });

  it('serves health and requires verified identity plus server-side tenant membership for private routes', async () => {
    let rateLimitAllowed = true;
    const membership: TenantMembership = {
      tenantId: 'tenant-1',
      subject: 'user-1',
      role: 'owner',
      status: 'active',
    };
    let acceptedContract: unknown = null;
    let revokedContractId: string | null = null;
    let databaseReady = true;
    const dependencies: CloudApiDependencies = {
      config: {
        issuer: authConfig.issuer,
        audience: authConfig.audience,
        jwksUrl: authConfig.jwksUrl,
        consentSigningSecret: secret,
      },
      identityVerifier: {
        verify: async (token) =>
          verifyAccessToken(token, {
            issuer: authConfig.issuer,
            audience: authConfig.audience,
            hmacSecret: secret,
          }),
      },
      careerGraph: {
        createFact: async () => {
          throw new Error('not exercised in this test');
        },
        listFacts: async () => [],
        reviewFact: async () => {
          throw new Error('not exercised in this test');
        },
      },
      rateLimiter: { consume: async () => rateLimitAllowed },
      repository: {
        findMembershipsBySubject: async () => [membership],
        acceptSprintContract: async (record) => {
          acceptedContract = {
            ...record,
            id: '40000000-0000-4000-8000-000000000004',
            revision: 1,
          };
          return { id: '40000000-0000-4000-8000-000000000004', revision: 1 };
        },
        getActiveSprintContract: async () => acceptedContract as never,
        revokeSprintContract: async ({ contractId }) => {
          revokedContractId = contractId;
          acceptedContract = null;
        },
        checkReady: async () => {
          if (!databaseReady) throw new Error('database unavailable');
        },
        getControlState: async (tenantId) => ({
          tenantId,
          globalKillSwitch: true,
          pausedChannels: [],
          updatedAt: new Date().toISOString(),
        }),
        setGlobalKillSwitchWithAudit: async () => undefined,
        setChannelPauseWithAudit: async () => undefined,
      },
    };
    const server = createCloudApiServer(dependencies);
    server.listen(0);
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Expected TCP address');
    try {
      const health = await fetch(`http://127.0.0.1:${address.port}/health/live`);
      expect(health.status).toBe(200);
      const ready = await fetch(`http://127.0.0.1:${address.port}/health/ready`);
      expect(ready.status).toBe(200);
      databaseReady = false;
      const notReady = await fetch(`http://127.0.0.1:${address.port}/health/ready`);
      expect(notReady.status).toBe(503);
      databaseReady = true;
      const unauthorized = await fetch(`http://127.0.0.1:${address.port}/v1/me`);
      expect(unauthorized.status).toBe(401);
      const token = signToken({
        sub: 'user-1',
        iss: authConfig.issuer,
        aud: authConfig.audience,
        exp: 2_000_000_000,
        tenant_id: 'attacker-tenant',
      });
      const me = await fetch(`http://127.0.0.1:${address.port}/v1/me`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(me.status).toBe(200);
      expect(await me.json()).toMatchObject({ tenantId: 'tenant-1', subject: 'user-1' });
      const contractResponse = await fetch(`http://127.0.0.1:${address.port}/v1/sprint-contract`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify(contractInput),
      });
      expect(contractResponse.status).toBe(201);
      const accepted = await contractResponse.json();
      expect(accepted).toMatchObject({ id: '40000000-0000-4000-8000-000000000004', revision: 1 });
      expect(acceptedContract).toMatchObject({ tenantId: 'tenant-1', subject: 'user-1' });

      const activeContract = await fetch(`http://127.0.0.1:${address.port}/v1/sprint-contract`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(activeContract.status).toBe(200);
      expect(await activeContract.json()).toMatchObject({ contract: { acceptedBy: 'user-1' } });

      const revoke = await fetch(
        `http://127.0.0.1:${address.port}/v1/sprint-contract/40000000-0000-4000-8000-000000000004/revoke`,
        {
          method: 'POST',
          headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
          body: '{}',
        }
      );
      expect(revoke.status).toBe(200);
      expect(revokedContractId).toBe('40000000-0000-4000-8000-000000000004');

      const pause = await fetch(`http://127.0.0.1:${address.port}/v1/controls/channel-pause`, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ channel: 'email', paused: true }),
      });
      expect(pause.status).toBe(200);
      expect(await pause.json()).toMatchObject({
        tenantId: 'tenant-1',
        channel: 'email',
        paused: true,
      });
      rateLimitAllowed = false;
      const limited = await fetch(`http://127.0.0.1:${address.port}/v1/me`, {
        headers: { authorization: `Bearer ${token}` },
      });
      expect(limited.status).toBe(429);
    } finally {
      server.close();
      await once(server, 'close');
    }
  });
});
