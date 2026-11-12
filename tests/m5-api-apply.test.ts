import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudApiDependencies } from '../apps/api/src/ports';
import { createCloudApiServer } from '../apps/api/src/server';
import type { SprintContract } from '../packages/cloud-core/src/contract';
import type { AssistQueueItem } from '../packages/cloud-core/src/apply/assist-queue';

const tenantId = '10000000-0000-4000-8000-000000000001';
const subject = 'candidate:alice';

const sampleContract: SprintContract = {
  version: 1,
  roles: ['Senior Backend Engineer'],
  seniority: ['senior'],
  locations: ['San Francisco, CA'],
  remotePreference: 'remote',
  salaryFloor: { amount: 180000, currency: 'USD' },
  workAuthorization: {
    countries: ['US'],
    requiresSponsorship: false,
    confirmed: true,
  },
  blocklist: {
    companies: [],
    industries: [],
  },
  enabledChannels: ['ats', 'email', 'calendar', 'linkedin_assist'],
  dailyCaps: {
    applications: 20,
    emails: 10,
    assistQueueItems: 10,
    calendarEvents: 5,
  },
  defaultAnswers: {},
  allowedFactIds: [],
  tone: 'professional',
  senderIdentity: { name: 'Alice Walker', email: 'alice@example.com' },
  jurisdiction: ['US'],
  outreachConsent: true,
  consentTextVersion: 'v1.0',
  startsAt: '2026-11-12T00:00:00.000Z',
  endsAt: '2026-11-16T00:00:00.000Z',
};

function createDependencies(): {
  dependencies: CloudApiDependencies;
  assistItems: AssistQueueItem[];
} {
  const assistItems: AssistQueueItem[] = [];

  const dependencies: CloudApiDependencies = {
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
      createApplication: vi.fn(async () => ({
        id: 'app-1',
        tenantId,
        company: 'Figma',
        role: 'Senior Backend Engineer',
        status: 'applied' as const,
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
      recordActivityEvent: vi.fn(async () => ({}) as any),
      listActivityEvents: vi.fn(async () => []),
    },
    assistQueue: {
      enqueue: vi.fn(async (_tenantId, item) => {
        assistItems.push(item);
        return item;
      }),
      list: vi.fn(async (_tenantId, status) => {
        return status ? assistItems.filter((i) => i.status === status) : assistItems;
      }),
      getById: vi.fn(async (_tenantId, id) => {
        return assistItems.find((i) => i.id === id) || null;
      }),
      markOpened: vi.fn(async (_tenantId, id) => {
        const item = assistItems.find((i) => i.id === id);
        if (!item) throw new Error('Not found');
        item.status = 'opened';
        item.openedAt = new Date().toISOString();
        return item;
      }),
      complete: vi.fn(async (_tenantId, id, notes) => {
        const item = assistItems.find((i) => i.id === id);
        if (!item) throw new Error('Not found');
        item.status = 'completed';
        item.completedAt = new Date().toISOString();
        if (notes) item.assistNotes = notes;
        return item;
      }),
      dismiss: vi.fn(async (_tenantId, id) => {
        const item = assistItems.find((i) => i.id === id);
        if (!item) throw new Error('Not found');
        item.status = 'dismissed';
        return item;
      }),
    },
  };

  return { dependencies, assistItems };
}

describe('Milestone M5 - API ATS Apply & Assist Queue Endpoints', () => {
  let server: ReturnType<typeof createCloudApiServer>;
  let baseUrl: string;

  afterEach(async () => {
    if (server) {
      server.close();
      await once(server, 'close');
    }
  });

  async function startServer(deps: CloudApiDependencies) {
    server = createCloudApiServer(deps);
    server.listen(0);
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Invalid address');
    baseUrl = `http://127.0.0.1:${address.port}`;
  }

  it('POST /v1/apply/submit executes autonomous apply and returns proof', async () => {
    const { dependencies } = createDependencies();
    await startServer(dependencies);

    const response = await fetch(`${baseUrl}/v1/apply/submit`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        job: {
          sourceId: 'job_greenhouse_1',
          platform: 'greenhouse',
          company: 'Stripe',
          title: 'Senior Infrastructure Engineer',
          location: 'San Francisco, CA',
          remoteType: 'remote',
          url: 'https://boards.greenhouse.io/stripe/jobs/998877',
          externalId: 'ext_998877',
          descriptionText: 'Join Stripe infrastructure team.',
        },
        evaluationScore: 4.6,
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.result.status).toBe('applied');
    expect(body.result.proof).toBeDefined();
    expect(body.result.proof.payloadSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(body.result.proof.confirmationNumber).toBeDefined();
  });

  it('POST /v1/apply/submit routes to Assist Queue when bot challenge is encountered (H2)', async () => {
    const { dependencies, assistItems } = createDependencies();
    await startServer(dependencies);

    const response = await fetch(`${baseUrl}/v1/apply/submit`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        job: {
          sourceId: 'job_lever_1',
          platform: 'lever',
          company: 'Notion',
          title: 'Staff Product Engineer',
          location: 'San Francisco, CA',
          remoteType: 'remote',
          url: 'https://jobs.lever.co/notion/554433',
          externalId: 'ext_554433',
          descriptionText: 'Building the connected workspace.',
        },
        evaluationScore: 4.8,
        mockDriver: {
          html: '<html><body><div class="cf-turnstile"></div></body></html>',
          fields: [],
        },
      }),
    });

    expect(response.status).toBe(200);
    const body = (await response.json()) as any;
    expect(body.result.status).toBe('assist_required');
    expect(body.result.assistQueueItem).toBeDefined();
    expect(body.result.assistQueueItem.handOffReason).toBe('captcha_detected');
    expect(assistItems).toHaveLength(1);
    expect(assistItems[0].company).toBe('Notion');
  });

  it('GET and POST /v1/assist-queue manages lifecycle of assist items', async () => {
    const { dependencies, assistItems } = createDependencies();
    const itemId = '20000000-0000-4000-8000-000000000001';
    assistItems.push({
      id: itemId,
      tenantId,
      applicationId: null,
      company: 'Scale AI',
      role: 'Staff ML Engineer',
      platform: 'greenhouse',
      targetUrl: 'https://boards.greenhouse.io/scaleai/jobs/112233',
      handOffReason: 'captcha_detected',
      status: 'pending',
      prefilledPayload: { firstName: 'Alice' },
      userGestureRequired: true,
      createdAt: '2026-11-12T00:00:00.000Z',
      updatedAt: '2026-11-12T00:00:00.000Z',
    });

    await startServer(dependencies);

    // 1. GET /v1/assist-queue
    const getRes = await fetch(`${baseUrl}/v1/assist-queue`, {
      method: 'GET',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
      },
    });
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as any;
    expect(getBody.items).toHaveLength(1);
    expect(getBody.items[0].company).toBe('Scale AI');

    // 2. POST /v1/assist-queue/:id/open
    const openRes = await fetch(`${baseUrl}/v1/assist-queue/${itemId}/open`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
      },
    });
    expect(openRes.status).toBe(200);
    const openBody = (await openRes.json()) as any;
    expect(openBody.item.status).toBe('opened');

    // 3. POST /v1/assist-queue/:id/complete
    const completeRes = await fetch(`${baseUrl}/v1/assist-queue/${itemId}/complete`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        assistNotes: 'Solved captcha manually and verified submission confirmation.',
      }),
    });
    expect(completeRes.status).toBe(200);
    const completeBody = (await completeRes.json()) as any;
    expect(completeBody.item.status).toBe('completed');
    expect(completeBody.item.assistNotes).toContain('Solved captcha manually');
  });
});

