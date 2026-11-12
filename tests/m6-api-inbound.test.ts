import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudApiDependencies } from '../apps/api/src/ports';
import { createCloudApiServer } from '../apps/api/src/server';
import type { SprintContract } from '../packages/cloud-core/src/contract';
import type { InboundMessageRecord } from '../apps/api/src/inbound-repository';

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
  blocklist: { companies: [], industries: [] },
  enabledChannels: ['ats', 'email', 'calendar', 'linkedin_assist'],
  dailyCaps: { applications: 20, emails: 10, assistQueueItems: 10, calendarEvents: 5 },
  defaultAnswers: {},
  allowedFactIds: [],
  tone: 'professional',
  senderIdentity: { name: 'Alice Turing', email: 'alice@example.com' },
  jurisdiction: ['US'],
  outreachConsent: true,
  consentTextVersion: 'v1.0',
  startsAt: '2026-11-12T00:00:00.000Z',
  endsAt: '2026-11-16T00:00:00.000Z',
};

function createDependencies(): {
  dependencies: CloudApiDependencies;
  inboundMessages: InboundMessageRecord[];
} {
  const inboundMessages: InboundMessageRecord[] = [];

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
      createApplication: vi.fn(),
      getApplication: vi.fn(),
      listApplications: vi.fn(async () => [
        {
          id: 'app-stripe-1',
          tenantId,
          company: 'Stripe',
          role: 'Staff Infrastructure Engineer',
          status: 'applied' as const,
          channel: 'ats' as const,
          metadata: {},
          createdBy: subject,
          createdAt: '2026-11-12T00:00:00.000Z',
          updatedAt: '2026-11-12T00:00:00.000Z',
        },
      ]),
      transitionApplication: vi.fn(async () => ({}) as any),
      withdrawApplication: vi.fn(),
      getApplicationTimeline: vi.fn(async () => []),
      getDashboardMetrics: vi.fn(async () => ({}) as any),
      recordActivityEvent: vi.fn(async () => ({}) as any),
      listActivityEvents: vi.fn(async () => []),
    },
    inbound: {
      recordMessage: vi.fn(async (_tenantId, msg) => {
        const record: InboundMessageRecord = {
          ...msg,
          id: 'inbound_rec_1',
          tenantId,
          createdAt: new Date().toISOString(),
        };
        inboundMessages.push(record);
        return record;
      }),
      listMessages: vi.fn(async () => inboundMessages),
      markHandled: vi.fn(),
    },
  };

  return { dependencies, inboundMessages };
}

describe('Milestone M6 - API Inbound Email & Scheduling Endpoints', () => {
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

  it('POST /v1/inbound/classify-email returns classification and sanitized text', async () => {
    const { dependencies } = createDependencies();
    await startServer(dependencies);

    const res = await fetch(`${baseUrl}/v1/inbound/classify-email`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        senderEmail: 'recruiting@stripe.com',
        senderName: 'Stripe Recruiting',
        subject: 'Invitation to Interview - Stripe',
        bodyText: 'We would love to set up an introductory call with you this week!',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.classification.category).toBe('interview_invite');
    expect(body.classification.requiresScheduling).toBe(true);
    expect(body.classification.senderInfo.company).toBe('Stripe');
  });

  it('POST /v1/inbound/process-message books interview, updates tracker, and records message', async () => {
    const { dependencies, inboundMessages } = createDependencies();
    await startServer(dependencies);

    const res = await fetch(`${baseUrl}/v1/inbound/process-message`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          id: 'msg_ext_999',
          provider: 'google',
          sender: { email: 'recruiter@stripe.com', name: 'Sam Recruiter' },
          subject: 'Stripe Interview Invitation',
          bodyText: 'Hi Alice, let us schedule your phone screen!',
          receivedAt: new Date().toISOString(),
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.classification.category).toBe('interview_invite');
    expect(body.schedulingResult.action).toBe('interview_booked');
    expect(body.schedulingResult.calendarEvent).toBeDefined();
    expect(inboundMessages).toHaveLength(1);
    expect(dependencies.applicationTracker?.transitionApplication).toHaveBeenCalled();
  });

  it('POST /v1/calendar/free-busy returns busy slots for candidate availability', async () => {
    const { dependencies } = createDependencies();
    await startServer(dependencies);

    const res = await fetch(`${baseUrl}/v1/calendar/free-busy`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        timeMin: '2026-11-15T00:00:00Z',
        timeMax: '2026-11-16T00:00:00Z',
        timeZone: 'America/New_York',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.timeZone).toBe('America/New_York');
    expect(Array.isArray(body.busySlots)).toBe(true);
  });
});

