import { createHmac, generateKeyPairSync, randomBytes, sign as signJwt } from 'node:crypto';
import { once } from 'node:events';
import { describe, expect, it, vi } from 'vitest';
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
  type TenantKeyProvider,
} from '../packages/cloud-core/src/encryption';
import { resolveTenantContext, type TenantMembership } from '../packages/cloud-core/src/tenant';
import { MasterKeyTenantKeyProvider } from '../packages/cloud-core/src/master-key-provider';
import { createCloudApiServer, resolveClientIp } from '../apps/api/src/server';
import { loadCloudEnvironment } from '../apps/api/src/config';
import type { CloudApiDependencies } from '../apps/api/src/ports';
import {
  PostgresCloudApiRepository,
  type ClosableSqlPool,
  type SqlPool,
} from '../apps/api/src/postgres-repository';
import { PostgresCloudRateLimiter } from '../apps/api/src/postgres-rate-limiter';
import { createCloudApiRuntime } from '../apps/api/src/runtime';

describe('trusted proxy client IP resolution', () => {
  const request = (forwarded: string | undefined, remoteAddress = '10.0.1.25') =>
    ({
      headers: forwarded === undefined ? {} : { 'x-forwarded-for': forwarded },
      socket: { remoteAddress },
    }) as never;

  it('uses the rightmost valid address appended by a trusted ALB', () => {
    expect(resolveClientIp(request('198.51.100.99, 203.0.113.17'), true)).toBe('203.0.113.17');
    expect(resolveClientIp(request('2001:db8::1'), true)).toBe('2001:db8::1');
  });

  it('does not trust forwarded headers when proxy trust is disabled', () => {
    expect(resolveClientIp(request('203.0.113.17', '10.0.1.25'), false)).toBe('10.0.1.25');
  });

  it('falls back to the socket peer when the rightmost forwarded value is invalid', () => {
    expect(resolveClientIp(request('203.0.113.17, not-an-ip', '10.0.1.25'), true)).toBe(
      '10.0.1.25'
    );
  });
});

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

  it('accepts only exact HTTPS CORS origins from environment configuration', () => {
    const base = {
      NODE_ENV: 'test',
      CAREEROPS_JWT_ISSUER: authConfig.issuer,
      CAREEROPS_JWT_AUDIENCE: authConfig.audience,
      CAREEROPS_JWKS_URL: authConfig.jwksUrl,
      CAREEROPS_CONSENT_SIGNING_SECRET: secret,
      CAREEROPS_RATE_LIMIT_HASH_SECRET: rateSecret,
    };
    expect(
      loadCloudEnvironment({
        ...base,
        CAREEROPS_CORS_ALLOWED_ORIGINS:
          'https://main.d37etc5h2drv5h.amplifyapp.com, https://app.example.com',
      } as NodeJS.ProcessEnv).CAREEROPS_CORS_ALLOWED_ORIGINS
    ).toEqual(['https://main.d37etc5h2drv5h.amplifyapp.com', 'https://app.example.com']);
    expect(() =>
      loadCloudEnvironment({
        ...base,
        CAREEROPS_CORS_ALLOWED_ORIGINS: 'http://app.example.com',
      } as NodeJS.ProcessEnv)
    ).toThrow(/exact HTTPS origins/);
    expect(() =>
      loadCloudEnvironment({
        ...base,
        CAREEROPS_CORS_ALLOWED_ORIGINS: 'https://app.example.com/path',
      } as NodeJS.ProcessEnv)
    ).toThrow(/exact HTTPS origins/);
  });

  it('requires a valid injected master-key ring when LinkedIn token encryption is enabled', () => {
    const base = {
      NODE_ENV: 'test',
      CAREEROPS_JWT_ISSUER: authConfig.issuer,
      CAREEROPS_JWT_AUDIENCE: authConfig.audience,
      CAREEROPS_JWKS_URL: authConfig.jwksUrl,
      CAREEROPS_CONSENT_SIGNING_SECRET: secret,
      CAREEROPS_RATE_LIMIT_HASH_SECRET: rateSecret,
      LINKEDIN_CLIENT_ID: 'linkedin-client',
      LINKEDIN_CLIENT_SECRET: 'linkedin-secret',
      LINKEDIN_REDIRECT_URI: 'https://app.example.com/linkedin/callback',
    };
    expect(() => loadCloudEnvironment(base as NodeJS.ProcessEnv)).toThrow(
      /requires a JSON key ring/
    );

    const validKeyRing = JSON.stringify({ v1: randomBytes(32).toString('base64') });
    const configured = loadCloudEnvironment({
      ...base,
      CAREEROPS_ENVELOPE_MASTER_KEYS: validKeyRing,
      CAREEROPS_ENVELOPE_CURRENT_KEY_VERSION: 'v1',
    } as NodeJS.ProcessEnv);
    expect(configured.CAREEROPS_ENVELOPE_CURRENT_KEY_VERSION).toBe('v1');

    expect(() =>
      loadCloudEnvironment({
        ...base,
        CAREEROPS_ENVELOPE_MASTER_KEYS: JSON.stringify({
          v1: Buffer.from('short').toString('base64'),
        }),
        CAREEROPS_ENVELOPE_CURRENT_KEY_VERSION: 'v1',
      } as NodeJS.ProcessEnv)
    ).toThrow(/requires a JSON key ring/);

    expect(() =>
      loadCloudEnvironment({
        ...base,
        CAREEROPS_ENVELOPE_MASTER_KEYS: validKeyRing,
        CAREEROPS_ENVELOPE_CURRENT_KEY_VERSION: 'v2',
      } as NodeJS.ProcessEnv)
    ).toThrow(/requires a JSON key ring/);
  });

  it('validates optional KMS key ARN and version as an all-or-nothing pair', () => {
    const base = {
      NODE_ENV: 'test',
      CAREEROPS_JWT_ISSUER: authConfig.issuer,
      CAREEROPS_JWT_AUDIENCE: authConfig.audience,
      CAREEROPS_JWKS_URL: authConfig.jwksUrl,
      CAREEROPS_CONSENT_SIGNING_SECRET: secret,
      CAREEROPS_RATE_LIMIT_HASH_SECRET: rateSecret,
    };
    const keyArn =
      'arn:aws:kms:ap-southeast-2:165328640460:key/11111111-2222-3333-4444-555555555555';

    expect(loadCloudEnvironment(base as NodeJS.ProcessEnv).CAREEROPS_KMS_KEY_ARN).toBeUndefined();
    expect(loadCloudEnvironment({
      ...base,
      CAREEROPS_KMS_KEY_ARN: keyArn,
      CAREEROPS_KMS_KEY_VERSION: 'kms-v1',
    } as NodeJS.ProcessEnv).CAREEROPS_KMS_KEY_VERSION).toBe('kms-v1');

    for (const invalid of [
      { CAREEROPS_KMS_KEY_ARN: keyArn },
      { CAREEROPS_KMS_KEY_VERSION: 'kms-v1' },
      { CAREEROPS_KMS_KEY_ARN: 'arn:aws:kms:ap-southeast-2:123:key/not-a-key', CAREEROPS_KMS_KEY_VERSION: 'kms-v1' },
      { CAREEROPS_KMS_KEY_ARN: keyArn, CAREEROPS_KMS_KEY_VERSION: 'v1' },
    ]) {
      expect(() => loadCloudEnvironment({
        ...base,
        ...invalid,
      } as NodeJS.ProcessEnv)).toThrow(/canonical key ARN and a kms-vN key version together/);
    }
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
    expect(
      verifyAccessToken(
        signToken(claims),
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

    const cognitoIssuer =
      'https://cognito-idp.ap-southeast-2.amazonaws.com/ap-southeast-2_fhknKz871';
    const cognitoClientId = '3pjaus5ndmnhvp1mo4i6o0keu8';
    const cognitoVerifier = new OidcJwksVerifier(
      {
        issuer: cognitoIssuer,
        audience: cognitoClientId,
        jwksUrl: `${cognitoIssuer}/.well-known/jwks.json`,
      },
      fetcher as typeof fetch
    );
    const cognitoAccessToken = signClaims({
      sub: 'cognito-user-1',
      iss: cognitoIssuer,
      client_id: cognitoClientId,
      token_use: 'access',
      exp: 2_000_000_000,
      iat: 1_900_000_000,
    });
    expect((await cognitoVerifier.verify(cognitoAccessToken, 1_900_000_000)).subject).toBe(
      'cognito-user-1'
    );
    await expect(
      cognitoVerifier.verify(
        signClaims({
          sub: 'cognito-user-1',
          iss: cognitoIssuer,
          aud: cognitoClientId,
          token_use: 'id',
          exp: 2_000_000_000,
        }),
        1_900_000_000
      )
    ).rejects.toThrow('Cognito client_id');
    const [headerPart, payloadPart, signaturePart] = token.split('.');
    const tamperedSignature = `${signaturePart[0] === 'A' ? 'B' : 'A'}${signaturePart.slice(1)}`;
    await expect(
      verifier.verify(`${headerPart}.${payloadPart}.${tamperedSignature}`, 1_900_000_000)
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
    const keyProvider: TenantKeyProvider = {
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
        if (id !== `${tenantId}|${context}`) throw new Error('Key context mismatch');
        return Buffer.from(keys.get(id)!);
      },
    };
    const cipher = new TenantEnvelopeCipher(keyProvider);
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

  it('wraps tenant data keys locally and supports envelope master-key rotation', async () => {
    const versionOneKey = randomBytes(32);
    const versionTwoKey = randomBytes(32);
    const originalProvider = new MasterKeyTenantKeyProvider({
      masterKeys: { v1: versionOneKey.toString('base64') },
      currentKeyVersion: 'v1',
    });
    const originalCipher = new TenantEnvelopeCipher(originalProvider);
    const originalEnvelope = await originalCipher.encrypt(
      'tenant-123',
      'linkedin-token:member-1',
      Buffer.from('oauth access token')
    );
    expect(originalEnvelope.keyVersion).toBe('v1');

    const rotatedProvider = new MasterKeyTenantKeyProvider({
      masterKeys: {
        v1: versionOneKey.toString('base64'),
        v2: versionTwoKey.toString('base64'),
      },
      currentKeyVersion: 'v2',
    });
    const rotatedCipher = new TenantEnvelopeCipher(rotatedProvider);
    try {
      await expect(
        rotatedCipher.decrypt(originalEnvelope, 'tenant-123', 'linkedin-token:member-1')
      ).resolves.toEqual(Buffer.from('oauth access token'));

      const rotatedEnvelope = await rotatedCipher.encrypt(
        'tenant-123',
        'linkedin-token:member-1',
        Buffer.from('rotated oauth token')
      );
      expect(rotatedEnvelope.keyVersion).toBe('v2');
      await expect(
        rotatedCipher.decrypt(rotatedEnvelope, 'tenant-123', 'linkedin-token:member-1')
      ).resolves.toEqual(Buffer.from('rotated oauth token'));
      await expect(
        rotatedCipher.decrypt(originalEnvelope, 'other-tenant', 'linkedin-token:member-1')
      ).rejects.toThrow('mismatch');

      const tamperedEnvelope = {
        ...originalEnvelope,
        wrappedKey: Buffer.from('tampered').toString('base64'),
      };
      await expect(
        rotatedCipher.decrypt(tamperedEnvelope, 'tenant-123', 'linkedin-token:member-1')
      ).rejects.toThrow();
    } finally {
      originalProvider.destroy();
      rotatedProvider.destroy();
      versionOneKey.fill(0);
      versionTwoKey.fill(0);
    }
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
        allowedOrigins: ['https://main.d37etc5h2drv5h.amplifyapp.com'],
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
      const preflight = await fetch(`http://127.0.0.1:${address.port}/v1/me`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://main.d37etc5h2drv5h.amplifyapp.com',
          'access-control-request-method': 'GET',
          'access-control-request-headers': 'authorization, content-type, x-tenant-id',
        },
      });
      expect(preflight.status).toBe(204);
      expect(preflight.headers.get('access-control-allow-origin')).toBe(
        'https://main.d37etc5h2drv5h.amplifyapp.com'
      );
      expect(preflight.headers.get('access-control-allow-credentials')).toBeNull();

      const rejectedPreflight = await fetch(`http://127.0.0.1:${address.port}/v1/me`, {
        method: 'OPTIONS',
        headers: {
          origin: 'https://attacker.example',
          'access-control-request-method': 'GET',
        },
      });
      expect(rejectedPreflight.status).toBe(403);
      expect(rejectedPreflight.headers.get('access-control-allow-origin')).toBeNull();

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

describe('encrypted envelope strict decoding', () => {
  const key = randomBytes(32);
  const provider: TenantKeyProvider = {
    generateDataKey: async () => ({
      plaintextKey: randomBytes(32),
      wrappedKey: Buffer.from('wrapped-key').toString('base64'),
      keyVersion: 'v1',
    }),
    unwrapDataKey: async () => Buffer.from(key),
  };

  it('round-trips empty and non-empty plaintext using canonical encodings', async () => {
    const cipher = new TenantEnvelopeCipher(provider);
    const empty = await cipher.encrypt('tenant-1', 'career-graph:profile', Buffer.alloc(0));
    await expect(
      cipher.decrypt(empty, 'tenant-1', 'career-graph:profile')
    ).resolves.toEqual(Buffer.alloc(0));

    const value = await cipher.encrypt(
      'tenant-1',
      'career-graph:profile',
      Buffer.from('private fact')
    );
    await expect(
      cipher.decrypt(value, 'tenant-1', 'career-graph:profile')
    ).resolves.toEqual(Buffer.from('private fact'));
  });

  it('rejects non-canonical IV, tag, ciphertext and invalid key versions before unwrap', async () => {
    const unwrapDataKey = vi.fn(provider.unwrapDataKey);
    const cipher = new TenantEnvelopeCipher({ ...provider, unwrapDataKey });
    const valid = await cipher.encrypt(
      'tenant-1',
      'career-graph:profile',
      Buffer.from('private fact')
    );

    await expect(
      cipher.decrypt({ ...valid, iv: '!!!!' }, 'tenant-1', 'career-graph:profile')
    ).rejects.toThrow('base64');
    await expect(
      cipher.decrypt({ ...valid, authTag: 'AA==' }, 'tenant-1', 'career-graph:profile')
    ).rejects.toThrow();
    await expect(
      cipher.decrypt({ ...valid, ciphertext: 'YQ' }, 'tenant-1', 'career-graph:profile')
    ).rejects.toThrow();
    await expect(
      cipher.decrypt({ ...valid, keyVersion: '../v1' }, 'tenant-1', 'career-graph:profile')
    ).rejects.toThrow('context');
    expect(unwrapDataKey).not.toHaveBeenCalled();
  });

  it('rejects cross-tenant and cross-context envelopes before key unwrap', async () => {
    const unwrapDataKey = vi.fn(provider.unwrapDataKey);
    const cipher = new TenantEnvelopeCipher({ ...provider, unwrapDataKey });
    const envelope = await cipher.encrypt(
      'tenant-1',
      'career-graph:profile',
      Buffer.from('private fact')
    );

    await expect(cipher.decrypt(envelope, 'tenant-2', 'career-graph:profile')).rejects.toThrow(
      'mismatch'
    );
    await expect(cipher.decrypt(envelope, 'tenant-1', 'career-graph:resume')).rejects.toThrow(
      'mismatch'
    );
    expect(unwrapDataKey).not.toHaveBeenCalled();
  });
});


describe('local envelope master-key lifecycle', () => {
  it('zeroizes every retained master key and rejects use after destroy', async () => {
    const first = randomBytes(32);
    const second = randomBytes(32);
    const provider = new MasterKeyTenantKeyProvider({
      masterKeys: {
        v1: first.toString('base64'),
        v2: second.toString('base64'),
      },
      currentKeyVersion: 'v2',
    });
    const retainedKeys = (provider as unknown as {
      masterKeys: Map<string, Buffer>;
    }).masterKeys;
    const firstRetained = retainedKeys.get('v1');
    const secondRetained = retainedKeys.get('v2');
    expect(firstRetained).toBeDefined();
    expect(secondRetained).toBeDefined();

    provider.destroy();

    expect(firstRetained?.every((byte) => byte === 0)).toBe(true);
    expect(secondRetained?.every((byte) => byte === 0)).toBe(true);
    expect(retainedKeys.size).toBe(0);
    await expect(provider.generateDataKey('tenant-1', 'career-graph:profile'))
      .rejects.toThrow('master key is unavailable');
    await expect(provider.unwrapDataKey(
      'tenant-1',
      Buffer.from('opaque').toString('base64'),
      'v1',
      'career-graph:profile'
    )).rejects.toThrow('unavailable master-key version');

    first.fill(0);
    second.fill(0);
  });

  it('zeroizes already-imported keys when a later key-ring entry is invalid', () => {
    const validKey = randomBytes(32);
    const ring = {
      v1: validKey.toString('base64'),
      v2: 'not-canonical-base64!',
    };
    // Constructor failure must not leave a usable provider. The valid source
    // buffer is caller-owned; provider-owned copies are cleared on failure.
    expect(() => new MasterKeyTenantKeyProvider({
      masterKeys: ring,
      currentKeyVersion: 'v1',
    })).toThrow('Invalid base64 value');
    validKey.fill(0);
  });
});


describe('local envelope master-key rotation and shutdown', () => {
  it('reads envelopes from retained key versions while writing with the current version', async () => {
    const oldKey = randomBytes(32);
    const currentKey = randomBytes(32);
    const oldProvider = new MasterKeyTenantKeyProvider({
      masterKeys: { v1: oldKey.toString('base64') },
      currentKeyVersion: 'v1',
    });
    const oldCipher = new TenantEnvelopeCipher(oldProvider);
    const oldEnvelope = await oldCipher.encrypt(
      'tenant-rotation',
      'career-graph:profile',
      Buffer.from('legacy encrypted profile')
    );

    const rotatedProvider = new MasterKeyTenantKeyProvider({
      masterKeys: {
        v1: oldKey.toString('base64'),
        v2: currentKey.toString('base64'),
      },
      currentKeyVersion: 'v2',
    });
    const rotatedCipher = new TenantEnvelopeCipher(rotatedProvider);
    try {
      await expect(
        rotatedCipher.decrypt(oldEnvelope, 'tenant-rotation', 'career-graph:profile')
      ).resolves.toEqual(Buffer.from('legacy encrypted profile'));

      const newEnvelope = await rotatedCipher.encrypt(
        'tenant-rotation',
        'career-graph:profile',
        Buffer.from('new profile')
      );
      expect(newEnvelope.keyVersion).toBe('v2');
      await expect(
        rotatedCipher.decrypt(newEnvelope, 'tenant-rotation', 'career-graph:profile')
      ).resolves.toEqual(Buffer.from('new profile'));
    } finally {
      oldProvider.destroy();
      rotatedProvider.destroy();
      oldKey.fill(0);
      currentKey.fill(0);
    }
  });

  it('makes destroy idempotent and rejects all future local key operations', async () => {
    const key = randomBytes(32);
    const provider = new MasterKeyTenantKeyProvider({
      masterKeys: { v1: key.toString('base64') },
      currentKeyVersion: 'v1',
    });
    const retained = (provider as unknown as {
      masterKeys: Map<string, Buffer>;
    }).masterKeys.get('v1');

    provider.destroy();
    provider.destroy();

    expect(retained?.every((byte) => byte === 0)).toBe(true);
    await expect(provider.generateDataKey('tenant-1', 'career-graph:profile'))
      .rejects.toThrow('master key is unavailable');
    await expect(provider.unwrapDataKey(
      'tenant-1',
      Buffer.from('opaque').toString('base64'),
      'v1',
      'career-graph:profile'
    )).rejects.toThrow('unavailable master-key version');
    key.fill(0);
  });
});


describe('envelope encryption runtime activation gate', () => {
  it('blocks production startup until KMS is wired into the API composition root', async () => {
    const { assertEnvelopeEncryptionRuntimeReady } = await import('../apps/api/src/config');
    expect(() => assertEnvelopeEncryptionRuntimeReady({
      NODE_ENV: 'production',
      CAREEROPS_KMS_KEY_ARN: undefined,
      CAREEROPS_KMS_KEY_VERSION: undefined,
    })).toThrow('Production API startup is blocked');
  });

  it('fails closed when KMS configuration is present but runtime wiring is absent', async () => {
    const { assertEnvelopeEncryptionRuntimeReady } = await import('../apps/api/src/config');
    expect(() => assertEnvelopeEncryptionRuntimeReady({
      NODE_ENV: 'test',
      CAREEROPS_KMS_KEY_ARN: 'arn:aws:kms:ap-southeast-2:165328640460:key/11111111-2222-3333-4444-555555555555',
      CAREEROPS_KMS_KEY_VERSION: 'kms-v1',
    })).toThrow('AWS SDK client is not wired');
  });

  it('allows local-key development and test environments only when KMS is not configured', async () => {
    const { assertEnvelopeEncryptionRuntimeReady } = await import('../apps/api/src/config');
    expect(() => assertEnvelopeEncryptionRuntimeReady({
      NODE_ENV: 'development',
      CAREEROPS_KMS_KEY_ARN: undefined,
      CAREEROPS_KMS_KEY_VERSION: undefined,
    })).not.toThrow();
    expect(() => assertEnvelopeEncryptionRuntimeReady({
      NODE_ENV: 'test',
      CAREEROPS_KMS_KEY_ARN: undefined,
      CAREEROPS_KMS_KEY_VERSION: undefined,
    })).not.toThrow();
  });
});
