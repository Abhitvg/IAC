import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudApiDependencies } from '../apps/api/src/ports';
import { createCloudApiServer } from '../apps/api/src/server';
import type { CandidateFact } from '../packages/cloud-core/src/career-graph-types';
import type { SprintContract } from '../packages/cloud-core/src/contract';

const tenantId = '10000000-0000-4000-8000-000000000001';
const subject = 'candidate:alice';

const sampleContract: SprintContract = {
  version: 1,
  roles: ['Staff Software Engineer'],
  seniority: ['staff'],
  locations: ['Remote'],
  remotePreference: 'remote',
  salaryFloor: { amount: 200000, currency: 'USD' },
  workAuthorization: { countries: ['US'], requiresSponsorship: false, confirmed: true },
  blocklist: { companies: [], industries: [] },
  enabledChannels: ['ats'],
  dailyCaps: { applications: 20, emails: 0, assistQueueItems: 5, calendarEvents: 2 },
  defaultAnswers: {},
  allowedFactIds: [],
  tone: 'professional',
  senderIdentity: { name: 'Alice Smith', email: 'alice@example.com' },
  jurisdiction: ['US'],
  outreachConsent: false,
  consentTextVersion: 'v1.0',
  startsAt: '2026-11-12T00:00:00.000Z',
  endsAt: '2026-11-16T00:00:00.000Z',
};

const sampleFact: CandidateFact = {
  factKey: 'experience.stripe-swe',
  category: 'experience',
  payload: {
    company: 'Stripe',
    role: 'Staff Software Engineer',
    startDate: '2021',
    endDate: null,
    isCurrent: true,
    achievements: ['Architected payment ledger processing 100k writes/sec'],
    technologies: ['TypeScript', 'Go'],
  },
  source: { kind: 'document' },
  suggestedConfidence: 1.0,
};

function createDependencies(): CloudApiDependencies {
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
      getActiveSprintContract: async () => ({
        id: 'contract-id',
        revision: 1,
        tenantId,
        subject,
        contract: sampleContract,
        contractHash: 'a'.repeat(64),
        acceptedAt: '2026-11-12T00:00:00.000Z',
        signature: 'b'.repeat(64),
        revokedAt: null,
      }),
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
      createApplication: vi.fn(),
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

describe('M4: Evaluation, Tailoring, and Truthfulness API Routes', () => {
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

  it('runs A-H evaluation via POST /v1/evaluation/evaluate', async () => {
    await startServer();

    const res = await fetch(`${baseUrl}/v1/evaluation/evaluate`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        job: {
          sourceId: 'src-1',
          platform: 'greenhouse',
          company: 'Datadog',
          title: 'Staff Software Engineer',
          location: 'Remote',
          remoteType: 'remote',
          url: 'https://example.com/job/1',
          externalId: '1',
          descriptionText: 'Distributed systems engineering with Go and TypeScript.',
        },
        confirmedFacts: [sampleFact],
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.report.score).toBeGreaterThanOrEqual(3.8);
    expect(data.report.recommendation).toBe('apply');
  });

  it('generates tailored artifacts via POST /v1/evaluation/tailor', async () => {
    await startServer();

    const res = await fetch(`${baseUrl}/v1/evaluation/tailor`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        job: {
          sourceId: 'src-1',
          platform: 'greenhouse',
          company: 'Anthropic',
          title: 'Staff Software Engineer',
          location: 'Remote',
          remoteType: 'remote',
          url: 'https://example.com/job/1',
          externalId: '1',
          descriptionText: 'Distributed systems engineering.',
        },
        confirmedFacts: [sampleFact],
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.artifacts.tailoredResumeLatex).toContain('Alice Smith');
    expect(data.truthfulness.passed).toBe(true);
  });

  it('verifies truthfulness via POST /v1/evaluation/verify-truthfulness', async () => {
    await startServer();

    // Grounded text passes
    const passRes = await fetch(`${baseUrl}/v1/evaluation/verify-truthfulness`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text: 'I worked at Stripe as a Staff Software Engineer.',
        confirmedFacts: [sampleFact],
        targetCompany: 'Anthropic',
      }),
    });

    expect(passRes.status).toBe(200);
    const passData = (await passRes.json()) as any;
    expect(passData.result.passed).toBe(true);

    // Fabricated employer claim fails
    const failRes = await fetch(`${baseUrl}/v1/evaluation/verify-truthfulness`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        text: 'I worked at Google as a Staff Software Engineer.',
        confirmedFacts: [sampleFact],
        targetCompany: 'Anthropic',
      }),
    });

    expect(failRes.status).toBe(200);
    const failData = (await failRes.json()) as any;
    expect(failData.result.passed).toBe(false);
    expect(failData.result.violations[0].category).toBe('employer');
  });
});
