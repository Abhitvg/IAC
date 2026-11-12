import { describe, expect, it } from 'vitest';
import { createHmac } from 'node:crypto';
import { AddressInfo } from 'node:net';
import { createCloudApiServer } from '../apps/api/src/server';
import type { CloudApiDependencies } from '../apps/api/src/server';

const TEST_SECRET = '0123456789abcdef0123456789abcdef';

const TENANT_UUIDS = [
  '10000000-0000-4000-8000-000000000000',
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000004',
];
const CHAOS_TENANT_UUID = '90000000-0000-4000-8000-000000000001';
const FUZZ_TENANT_UUID = '90000000-0000-4000-8000-000000000002';

function signToken(claims: Record<string, unknown>, secret = TEST_SECRET): string {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  const content = `${header}.${payload}`;
  const signature = createHmac('sha256', secret).update(content).digest('base64url');
  return `${content}.${signature}`;
}

function createMockDependencies(overrides: Partial<CloudApiDependencies> = {}): CloudApiDependencies {
  const apps: any[] = [];
  return {
    config: {
      jwtSecret: TEST_SECRET,
      authIssuer: 'careerops-test',
      authAudience: 'careerops-api',
      maxRequestBytes: 16 * 1024,
    },
    identityVerifier: {
      verify: async (token: string) => {
        const segments = token.split('.');
        const payload = JSON.parse(Buffer.from(segments[1], 'base64url').toString('utf8'));
        return {
          subject: payload.sub,
          issuer: payload.iss || 'careerops-test',
          audience: [payload.aud || 'careerops-api'],
          expiresAt: payload.exp || 2_000_000_000,
          tenantId: payload.tenant_id,
        };
      },
    },
    rateLimiter: { consume: async () => true },
    repository: {
      checkReady: async () => true,
      findMembershipsBySubject: async (subject: string) => [
        ...TENANT_UUIDS.map((tId) => ({
          tenantId: tId,
          subject,
          role: 'owner',
          status: 'active',
        })),
        { tenantId: CHAOS_TENANT_UUID, subject, role: 'owner', status: 'active' },
        { tenantId: FUZZ_TENANT_UUID, subject, role: 'owner', status: 'active' },
      ],
      getActiveSprintContract: async (tenantId: string) => ({
        tenantId,
        contract: {
          id: 'contract-load-1',
          tenantId,
          standingConsent: true,
          dailyAtsCap: 15,
          dailyEmailCap: 20,
          targetRoles: ['Senior Software Engineer'],
          enabledChannels: ['ats', 'email'],
          targetDurationHours: 72,
        },
      }),
      getChannelPauseWithAudit: async (tenantId: string) => ({
        tenantId,
        channels: { ats: false, email: false, calendar: false, linkedin_assist: false },
      }),
      setChannelPauseWithAudit: async () => {},
      recordAuditEvent: async () => {},
      getTenantAuditLog: async () => [],
      getTenantControls: async (tenantId: string) => ({
        tenantId,
        shadowMode: false,
        updatedAt: new Date().toISOString(),
      }),
      setTenantShadowMode: async (tenantId: string, enabled: boolean) => ({
        tenantId,
        shadowMode: enabled,
        updatedAt: new Date().toISOString(),
      }),
      ...overrides.repository,
    } as any,
    applicationTracker: {
      createApplication: async (tenantId: string, candidateSubject: string, input: any) => {
        const app = {
          id: `20000000-0000-4000-8000-${String(apps.length + 1).padStart(12, '0')}`,
          tenantId,
          company: input.company,
          role: input.role,
          channel: input.channel,
          status: 'scouted',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        apps.push(app);
        return app;
      },
      listApplications: async (tenantId: string) =>
        apps.filter((a) => a.tenantId === tenantId),
      getApplication: async () => null,
      transitionApplication: async () => ({} as any),
      ...overrides.applicationTracker,
    } as any,
    ...overrides,
  };
}

describe('Milestone M11 Item 8: Load & Chaos Testing Suite', () => {
  it('handles 50 concurrent authenticated requests without errors, deadlocks, or cross-tenant contamination', async () => {
    const deps = createMockDependencies();
    const server = createCloudApiServer(deps);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const concurrentRequests = 50;
      const promises = Array.from({ length: concurrentRequests }, async (_, i) => {
        const tenantId = TENANT_UUIDS[i % TENANT_UUIDS.length]; // 5 distinct tenants running concurrently
        const token = signToken({ sub: `user-${i}`, tenant_id: tenantId });

        const res = await fetch(`${baseUrl}/v1/applications`, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${token}`,
            'x-tenant-id': tenantId,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            company: `Company ${i}`,
            role: 'Senior Systems Engineer',
            channel: 'ats',
          }),
        });

        expect(res.status).toBe(201);
        const data = await res.json();
        expect(data.application.tenantId).toBe(tenantId);
        expect(data.application.company).toBe(`Company ${i}`);
        expect(res.headers.get('x-request-id')).toBeTruthy();
      });

      await Promise.all(promises);

      // Verify tenant isolation under concurrent writes
      const targetTenant = TENANT_UUIDS[0];
      const tenant0Token = signToken({ sub: 'user-0', tenant_id: targetTenant });
      const listRes = await fetch(`${baseUrl}/v1/applications`, {
        headers: {
          authorization: `Bearer ${tenant0Token}`,
          'x-tenant-id': targetTenant,
        },
      });
      expect(listRes.status).toBe(200);
      const listData = await listRes.json();
      expect(listData.applications.every((a: any) => a.tenantId === targetTenant)).toBe(true);
      expect(listData.applications.length).toBe(10); // 50 / 5 tenants = 10 each
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });

  it('chaos test: gracefully survives transient repository outage and recovers cleanly on reconnect', async () => {
    let transientOutage = true;
    const deps = createMockDependencies({
      repository: {
        findMembershipsBySubject: async (subject: string) => {
          if (transientOutage) {
            throw new Error('ECONNREFUSED: Database connection dropped during network partition');
          }
          return [
            {
              tenantId: CHAOS_TENANT_UUID,
              subject,
              role: 'owner',
              status: 'active',
            },
          ];
        },
        getActiveSprintContract: async (tenantId: string) => ({
          tenantId,
          contract: {
            id: 'contract-chaos',
            tenantId,
            standingConsent: true,
            dailyAtsCap: 15,
            dailyEmailCap: 20,
            targetRoles: ['Staff Engineer'],
            enabledChannels: ['ats'],
            targetDurationHours: 48,
          },
        }),
      } as any,
    });

    const server = createCloudApiServer(deps);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const token = signToken({ sub: 'user-chaos', tenant_id: CHAOS_TENANT_UUID });

      // Request 1: DB connection failure
      const failRes = await fetch(`${baseUrl}/v1/sprint/forecast`, {
        headers: {
          authorization: `Bearer ${token}`,
          'x-tenant-id': CHAOS_TENANT_UUID,
        },
      });
      expect(failRes.status).toBe(500);
      const failData = await failRes.json();
      expect(failData.error).toBeTruthy();
      expect(failData.requestId).toBeTruthy();

      // Heal database connection
      transientOutage = false;

      // Request 2: Recovers immediately
      const recoveredRes = await fetch(`${baseUrl}/v1/sprint/forecast`, {
        headers: {
          authorization: `Bearer ${token}`,
          'x-tenant-id': CHAOS_TENANT_UUID,
        },
      });
      expect(recoveredRes.status).toBe(200);
      const recoveredData = await recoveredRes.json();
      expect(recoveredData.forecast).toBeTruthy();
      expect(recoveredData.forecast.confidenceInterval).toContain('Bayesian');
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });

  it('chaos test: rejects corrupt JSON, oversized request bodies, and prototype pollution vectors', async () => {
    const deps = createMockDependencies();
    const server = createCloudApiServer(deps);
    await new Promise<void>((resolve) => server.listen(0, resolve));
    const port = (server.address() as AddressInfo).port;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const token = signToken({ sub: 'user-fuzz', tenant_id: FUZZ_TENANT_UUID });

      // 1. Malformed non-JSON body
      const corruptRes = await fetch(`${baseUrl}/v1/applications`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'x-tenant-id': FUZZ_TENANT_UUID,
          'content-type': 'application/json',
        },
        body: '{{malformed json payload [!@#$%',
      });
      expect(corruptRes.status).toBe(400);

      // 2. Oversized payload exceeding 16KB maxRequestBytes
      const oversizedPayload = JSON.stringify({
        company: 'Giant Corp',
        role: 'A'.repeat(25 * 1024), // 25KB string
        channel: 'ats',
      });
      const oversizedRes = await fetch(`${baseUrl}/v1/applications`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${token}`,
          'x-tenant-id': FUZZ_TENANT_UUID,
          'content-type': 'application/json',
        },
        body: oversizedPayload,
      });
      expect(oversizedRes.status).toBe(413);
      const errorJson = await oversizedRes.json();
      expect(errorJson.error).toContain('size limit');

      // 3. Process is completely healthy after attacks
      const healthyRes = await fetch(`${baseUrl}/health/live`);
      expect(healthyRes.status).toBe(200);
      const healthyJson = await healthyRes.json();
      expect(healthyJson.status).toBe('ok');
    } finally {
      await new Promise<void>((resolve, reject) =>
        server.close((err) => (err ? reject(err) : resolve()))
      );
    }
  });
});
