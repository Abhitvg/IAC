import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudApiDependencies } from '../apps/api/src/ports';
import { createCloudApiServer } from '../apps/api/src/server';
import type { SprintContract } from '../packages/cloud-core/src/contract';
import type { Person } from '../packages/cloud-core/src/person-graph/person-types';

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
  peopleStore: Person[];
  suppressionStore: any[];
} {
  const peopleStore: Person[] = [];
  const suppressionStore: any[] = [];

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
      setChannelPauseWithAudit: vi.fn(async () => undefined),
      setGlobalKillSwitchWithAudit: async () => undefined,
    },
    careerGraph: {
      createFact: vi.fn(),
      listFacts: vi.fn(async () => []),
      reviewFact: vi.fn(),
    },
    outreach: {
      addPerson: vi.fn(async (_t, person) => {
        const p: Person = {
          ...person,
          id: 'person_1',
          tenantId,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        peopleStore.push(p);
        return p;
      }),
      listPeople: vi.fn(async () => peopleStore),
      getPerson: vi.fn(async (_t, id) => peopleStore.find((p) => p.id === id) || null),
      updatePersonStage: vi.fn(async (_t, id, stage) => {
        const p = peopleStore.find((x) => x.id === id);
        if (p) p.crmStage = stage;
        return p!;
      }),
      addSuppression: vi.fn(async (_t, entry) => {
        suppressionStore.push(entry);
      }),
      listSuppression: vi.fn(async () => suppressionStore),
      recordOutreachMessage: vi.fn(async () => ({ id: 'outreach_msg_1' })),
      listOutreachForCompany: vi.fn(async () => []),
      getMailboxMetrics: vi.fn(async () => ({
        sentCount: 5,
        deliveredCount: 5,
        bounceCount: 0,
        complaintCount: 0,
        replyCount: 1,
      })),
    },
  };

  return { dependencies, peopleStore, suppressionStore };
}

describe('Milestone M7 - API Person Graph & Outreach Endpoints', () => {
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

  it('POST /v1/people rejects unverified/guessed contacts (H4)', async () => {
    const { dependencies } = createDependencies();
    await startServer(dependencies);

    const res = await fetch(`${baseUrl}/v1/people`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'guessed@startup.io',
        name: 'Guessed Contact',
        company: 'Startup',
        title: 'CTO',
        roleDomain: 'hiring_manager',
        relationship: 'cold',
        verificationSource: 'smtp_probe_guessed', // Unauthorized source!
      }),
    });

    expect(res.status).toBe(422);
    const body = (await res.json()) as any;
    expect(body.error).toContain('Hard Line H4');
  });

  it('POST /v1/people accepts verified contacts and GET /v1/people returns ranked contacts', async () => {
    const { dependencies } = createDependencies();
    await startServer(dependencies);

    const createRes = await fetch(`${baseUrl}/v1/people`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'recruiter@datadog.com',
        name: 'Alex Recruiter',
        company: 'Datadog',
        title: 'Lead Technical Recruiter',
        roleDomain: 'recruiter',
        relationship: '1st_degree',
        verificationSource: 'licensed_provider',
        provenanceEvidence: {
          verificationSource: 'licensed_provider',
          providerRecordId: 'rec_datadog_123',
          contentHash: 'a'.repeat(64),
          retrievedAt: new Date().toISOString(),
        },
      }),
    });

    expect(createRes.status).toBe(201);

    const listRes = await fetch(
      `${baseUrl}/v1/people?company=Datadog&targetRoleTitle=Senior+Engineer`,
      {
        method: 'GET',
        headers: {
          authorization: 'Bearer valid-token',
          'x-tenant-id': tenantId,
        },
      }
    );

    expect(listRes.status).toBe(200);
    const body = (await listRes.json()) as any;
    expect(body.people).toHaveLength(1);
    expect(body.people[0].score.compositeScore).toBeGreaterThanOrEqual(80);
  });

  it('POST /v1/outreach/send dispatches outreach email and updates contact state', async () => {
    const { dependencies, peopleStore } = createDependencies();
    peopleStore.push({
      id: 'person_stripe_1',
      tenantId,
      email: 'alex@stripe.com',
      name: 'Alex Rivera',
      company: 'Stripe',
      title: 'Engineering Director',
      roleDomain: 'hiring_manager',
      relationship: '1st_degree',
      verificationSource: 'licensed_provider',
      timeZone: 'UTC', // Not in quiet hours during UTC daytime
      crmStage: 'lead',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await startServer(dependencies);

    const res = await fetch(`${baseUrl}/v1/outreach/send`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        personId: 'person_stripe_1',
        targetRoleTitle: 'Staff Backend Engineer',
        hook: 'high-throughput payment ledgers',
        sequenceStep: 1,
        now: '2026-11-15T18:00:00Z',
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.execution.status).toBe('sent');
    expect(body.execution.wordCount).toBeGreaterThanOrEqual(50);
    expect(dependencies.outreach?.updatePersonStage).toHaveBeenCalledWith(
      tenantId,
      'person_stripe_1',
      'contacted',
      expect.any(String),
      subject
    );
  });

  it('POST /v1/outreach/opt-out adds email to suppression list and updates person stage', async () => {
    const { dependencies, peopleStore, suppressionStore } = createDependencies();
    peopleStore.push({
      id: 'person_opt_1',
      tenantId,
      email: 'optmeout@company.com',
      name: 'Opt Out Person',
      company: 'Company',
      title: 'Manager',
      roleDomain: 'hiring_manager',
      relationship: 'cold',
      verificationSource: 'licensed_provider',
      timeZone: 'UTC',
      crmStage: 'lead',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    await startServer(dependencies);

    const res = await fetch(`${baseUrl}/v1/outreach/opt-out`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'optmeout@company.com',
        reason: 'opt_out',
      }),
    });

    expect(res.status).toBe(200);
    expect(suppressionStore).toHaveLength(1);
    expect(suppressionStore[0].email).toBe('optmeout@company.com');
  });

  it('GET /v1/outreach/health returns current mailbox health metrics and adaptive cap', async () => {
    const { dependencies } = createDependencies();
    await startServer(dependencies);

    const res = await fetch(`${baseUrl}/v1/outreach/health`, {
      method: 'GET',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
      },
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.metrics.sentCount).toBe(5);
    expect(body.health.healthy).toBe(true);
    expect(body.currentCap).toBe(12);
  });
});
