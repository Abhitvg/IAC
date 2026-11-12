import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudApiDependencies } from '../apps/api/src/ports';
import { createCloudApiServer } from '../apps/api/src/server';
import type { SprintContract } from '../packages/cloud-core/src/contract';

const tenantId = '10000000-0000-4000-8000-000000000001';
const subject = 'candidate:alice';

const sampleContract: SprintContract = {
  version: 1,
  roles: ['Staff Software Engineer'],
  seniority: ['staff'],
  locations: ['San Francisco, CA'],
  remotePreference: 'remote',
  salaryFloor: { amount: 200000, currency: 'USD' },
  workAuthorization: {
    countries: ['US'],
    requiresSponsorship: false,
    confirmed: true,
  },
  blocklist: {
    companies: ['Competitor Corp'],
    industries: [],
  },
  enabledChannels: ['ats'],
  dailyCaps: {
    applications: 20,
    emails: 0,
    assistQueueItems: 5,
    calendarEvents: 2,
  },
  defaultAnswers: {},
  allowedFactIds: [],
  tone: 'professional',
  senderIdentity: { name: 'Alice', email: 'alice@example.com' },
  jurisdiction: ['US'],
  outreachConsent: false,
  consentTextVersion: 'v1.0',
  startsAt: '2026-11-12T00:00:00.000Z',
  endsAt: '2026-11-16T00:00:00.000Z',
};

function createDependencies(hasActiveContract = true): CloudApiDependencies {
  return {
    config: {
      issuer: 'https://identity.example.test',
      audience: 'careerops-api',
      jwksUrl: 'https://identity.example.test/.well-known/jwks.json',
      consentSigningSecret: 'test-secret-at-least-32-chars-long-12345',
      maxRequestBytes: 64 * 1024,
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
        globalKillSwitch: false,
        pausedChannels: [],
        updatedAt: '2026-11-12T00:00:00.000Z',
      }),
      acceptSprintContract: async () => ({ id: 'contract-id', revision: 1 }),
      getActiveSprintContract: async () =>
        hasActiveContract
          ? {
              id: 'contract-id',
              revision: 1,
              tenantId,
              subject,
              contract: sampleContract,
              contractHash: 'a'.repeat(64),
              acceptedAt: '2026-11-12T00:00:00.000Z',
              signature: 'b'.repeat(64),
              revokedAt: null,
            }
          : null,
      revokeSprintContract: async () => undefined,
      setChannelPauseWithAudit: async () => undefined,
      setGlobalKillSwitchWithAudit: async () => undefined,
    },
    careerGraph: {
      createFact: vi.fn(),
      listFacts: vi.fn(async () => []),
      reviewFact: vi.fn(),
    },
    applicationTracker: {
      createApplication: vi.fn(async () => ({
        id: 'app-1',
        tenantId,
        company: 'Stripe',
        role: 'Staff SWE',
        status: 'scouted' as const,
        channel: 'ats' as const,
        metadata: {},
        createdBy: subject,
        createdAt: '2026-11-12T00:00:00.000Z',
        updatedAt: '2026-11-12T00:00:00.000Z',
      })),
      getApplication: vi.fn(),
      listApplications: vi.fn(async () => []),
      transitionApplication: vi.fn(),
      withdrawApplication: vi.fn(),
      getApplicationTimeline: vi.fn(async () => []),
      getDashboardMetrics: vi.fn(async () => ({}) as any),
      appendActivityEvent: vi.fn(async () => ({}) as any),
      listActivityEvents: vi.fn(async () => []),
    },
  };
}

describe('M3: Discovery API Routes', () => {
  let server: ReturnType<typeof createCloudApiServer> | undefined;
  let baseUrl: string;

  afterEach(async () => {
    if (server?.listening) {
      server.close();
      await once(server, 'close');
    }
    server = undefined;
  });

  async function startServer(deps = createDependencies()): Promise<string> {
    server = createCloudApiServer(deps);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const addr = server.address();
    if (!addr || typeof addr === 'string') throw new Error('Failed to bind');
    baseUrl = `http://127.0.0.1:${addr.port}`;
    return baseUrl;
  }

  it('evaluates job posting credibility via POST /v1/discovery/evaluate-job', async () => {
    await startServer();

    const res = await fetch(`${baseUrl}/v1/discovery/evaluate-job`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sourceId: 'src-1',
        platform: 'greenhouse',
        company: 'Stripe',
        title: 'Staff Software Engineer',
        location: 'Remote',
        remoteType: 'remote',
        url: 'https://example.com/job/1',
        externalId: '1',
        descriptionText:
          'Build distributed systems infrastructure with TypeScript and Go. Minimum 8 years experience.',
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.report.isCredible).toBe(true);
    expect(data.report.isScam).toBe(false);
    expect(data.report.isGhost).toBe(false);
  });

  it('triggers a discovery wave via POST /v1/discovery/wave', async () => {
    await startServer(createDependencies(true));

    const res = await fetch(`${baseUrl}/v1/discovery/wave`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.summary).toBeDefined();
    expect(data.summary.timestamp).toBeDefined();
  });

  it('fails discovery wave if tenant lacks active Sprint Contract', async () => {
    await startServer(createDependencies(false));

    const res = await fetch(`${baseUrl}/v1/discovery/wave`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(400);
    const data = (await res.json()) as any;
    expect(data.error).toContain('Active Sprint Contract required');
  });
});
