import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudApiDependencies } from '../apps/api/src/ports';
import { createCloudApiServer } from '../apps/api/src/server';
import type { SprintContract } from '../packages/cloud-core/src/contract';

const tenantId = '10000000-0000-4000-8000-000000000001';
const subject = 'candidate:alice';

const sampleContract: SprintContract = {
  version: 1,
  roles: ['Staff Backend Engineer'],
  seniority: ['staff'],
  locations: ['San Francisco, CA'],
  remotePreference: 'remote',
  salaryFloor: { amount: 200000, currency: 'USD' },
  workAuthorization: { countries: ['US'], requiresSponsorship: false, confirmed: true },
  blocklist: { companies: [], industries: [] },
  enabledChannels: ['ats', 'email', 'calendar', 'linkedin_assist'],
  dailyCaps: { applications: 20, emails: 20, assistQueueItems: 10, calendarEvents: 5 },
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
  setChannelPauseSpy: any;
  auditStore: any[];
} {
  const auditStore: any[] = [];
  const setChannelPauseSpy = vi.fn(async () => undefined);

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
      setChannelPauseWithAudit: setChannelPauseSpy,
      setGlobalKillSwitchWithAudit: async () => undefined,
    },
    careerGraph: {
      createFact: vi.fn(),
      listFacts: vi.fn(async () => []),
      reviewFact: vi.fn(),
    },
    outreach: {
      addPerson: vi.fn(async (_t, person) => ({
        ...person,
        id: 'p_imported_1',
        tenantId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      })),
      listPeople: vi.fn(async () => []),
      getPerson: vi.fn(async () => null),
      updatePersonStage: vi.fn(async () => ({} as any)),
      addSuppression: vi.fn(),
      listSuppression: vi.fn(async () => []),
      recordOutreachMessage: vi.fn(),
      listOutreachForCompany: vi.fn(async () => []),
      getMailboxMetrics: vi.fn(async () => ({} as any)),
    },
    assistQueue: {
      enqueue: vi.fn(),
      list: vi.fn(async () => [
        {
          id: 'assist_li_1',
          tenantId,
          applicationId: null,
          company: 'Stripe',
          role: 'Staff Backend Engineer',
          platform: 'linkedin_assist',
          targetUrl: 'https://www.linkedin.com/in/sarah-connor',
          handOffReason: 'linkedin_assist',
          status: 'pending' as const,
          userGestureRequired: true,
          prefilledPayload: { prefilledText: 'Hello Sarah' },
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ]),
      getById: vi.fn(),
      markOpened: vi.fn(),
      complete: vi.fn(),
      dismiss: vi.fn(),
    },
    linkedinAudit: {
      saveAudit: vi.fn(async (_t, audit) => {
        auditStore.push(audit);
        return audit;
      }),
      getLatestAudit: vi.fn(async () => auditStore[auditStore.length - 1] || null),
    },
  };

  return { dependencies, setChannelPauseSpy, auditStore };
}

describe('Milestone M8 - API LinkedIn Compliant Layer Endpoints', () => {
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

  it('POST /v1/linkedin/oauth/token strictly rejects passwords and cookies (H1)', async () => {
    const { dependencies } = createDependencies();
    await startServer(dependencies);

    const res = await fetch(`${baseUrl}/v1/linkedin/oauth/token`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        access_token: 'valid_oauth_token',
        li_at: 'AQEDARXXXXX', // Forbidden cookie!
      }),
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as any;
    expect(body.error).toContain('Hard Line H1');
  });

  it('POST /v1/linkedin/oauth/token accepts valid official OAuth tokens', async () => {
    const { dependencies } = createDependencies();
    await startServer(dependencies);

    const res = await fetch(`${baseUrl}/v1/linkedin/oauth/token`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        access_token: 'official_access_token',
        expires_in: 3600,
        token_type: 'Bearer',
        scope: 'openid profile email',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.status).toBe('valid_oauth_token');
  });

  it('POST /v1/linkedin/import-export parses Connections.csv into Person Graph', async () => {
    const { dependencies } = createDependencies();
    await startServer(dependencies);

    const csvContent = `First Name,Last Name,URL,Email Address,Company,Position,Connected On\nSarah,Connor,https://linkedin.com/in/sarah,sarah@stripe.com,Stripe,Engineering Manager,12 Jan 2024\n`;

    const res = await fetch(`${baseUrl}/v1/linkedin/import-export`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ csvContent }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.importedCount).toBe(1);
    expect(body.sampleContacts[0].name).toBe('Sarah Connor');
    expect(dependencies.outreach?.addPerson).toHaveBeenCalled();
  });

  it('POST /v1/linkedin/profile-audit calculates optimization scores and saves audit', async () => {
    const { dependencies, auditStore } = createDependencies();
    await startServer(dependencies);

    const res = await fetch(`${baseUrl}/v1/linkedin/profile-audit`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        currentHeadline: 'Staff Backend Engineer | Distributed Systems & Infrastructure',
        currentAbout: 'Passionate about building scalable backend services...',
        currentSkills: ['TypeScript', 'Go', 'Distributed Systems', 'Kafka', 'PostgreSQL'],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.audit.overallScore).toBeGreaterThanOrEqual(80);
    expect(body.audit.openToWorkGuidance.visibility).toBe('recruiters_only');
    expect(auditStore).toHaveLength(1);
  });

  it('GET /v1/assist-queue/linkedin returns extension queue with userGestureRequired: true', async () => {
    const { dependencies } = createDependencies();
    await startServer(dependencies);

    const res = await fetch(`${baseUrl}/v1/assist-queue/linkedin`, {
      method: 'GET',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.count).toBe(1);
    expect(body.items[0].platform).toBe('linkedin_assist');
    expect(body.userGestureRequired).toBe(true);
  });

  it('POST /v1/linkedin/report-restriction auto-pauses linkedin_assist channel immediately', async () => {
    const { dependencies, setChannelPauseSpy } = createDependencies();
    await startServer(dependencies);

    const res = await fetch(`${baseUrl}/v1/linkedin/report-restriction`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        noticeType: 'invitation_limit_reached',
        details: 'Weekly limit reached',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.channelPaused).toBe(true);
    expect(setChannelPauseSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        channel: 'linkedin_assist',
        paused: true,
      })
    );
  });
});
