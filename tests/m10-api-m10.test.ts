import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudApiDependencies } from '../apps/api/src/ports';
import { createCloudApiServer } from '../apps/api/src/server';
import type { SprintContract } from '../packages/cloud-core/src/contract';
import type { ExperimentDefinition } from '../packages/cloud-core/src/experiments/types';

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
  experimentsStore: ExperimentDefinition[];
} {
  const experimentsStore: ExperimentDefinition[] = [];

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
      listFacts: vi.fn(async () => [
        {
          id: 'fact-1',
          tenantId,
          claim: 'Led distributed database scaling team',
          context: 'Experience',
          source: 'resume',
          status: 'confirmed',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        } as any,
      ]),
      reviewFact: vi.fn(),
    },
    applicationTracker: {
      createApplication: vi.fn(),
      getApplication: vi.fn(),
      listApplications: vi.fn(async () => [
        { id: 'app-1', status: 'submitted', company: 'Google', role: 'Staff SRE' } as any,
        { id: 'app-2', status: 'screen_scheduled', company: 'Meta', role: 'Staff SRE' } as any,
      ]),
      transitionApplication: vi.fn(),
    },
    outreach: {
      addPerson: vi.fn(),
      listPeople: vi.fn(async () => [
        { id: 'p-1', name: 'Recruiter Jane', email: 'jane@company.com' } as any,
      ]),
      getPerson: vi.fn(),
      updatePersonStage: vi.fn(),
      addSuppression: vi.fn(),
      isSuppressed: vi.fn(async () => false),
      logOutreachMessage: vi.fn(),
      countCompanyContactsForRole: vi.fn(async () => 1),
      getMailboxMetrics: vi.fn(async () => ({
        sentCount: 20,
        bounceCount: 0,
        complaintCount: 0,
        replyCount: 4,
      })),
    },
    experiments: {
      createExperiment: vi.fn(async (_t, exp) => {
        experimentsStore.push(exp);
        return exp;
      }),
      listExperiments: vi.fn(async () => experimentsStore),
      getExperiment: vi.fn(async (_t, id) => experimentsStore.find((e) => e.id === id) || null),
      recordEvent: vi.fn(async (_t, expId, varId, eventType) => {
        const match = experimentsStore.find((e) => e.id === expId);
        if (match) {
          const v = match.variants.find((vr) => vr.id === varId);
          if (v) {
            if (eventType === 'impression') v.impressions++;
            else v.conversions++;
          }
        }
      }),
      createDsarRequest: vi.fn(async () => ({ id: 'dsar-req-001' })),
      executeTenantPurge: vi.fn(async () => ({
        careerGraphFacts: 5,
        contracts: 1,
        applications: 2,
        people: 1,
        outreachMessages: 10,
        sprintRuns: 1,
      })),
    },
  };

  return { dependencies, experimentsStore };
}

describe('Milestone M10 - Experiments, Analytics, Privacy (DSAR) & Billing API', () => {
  let server: ReturnType<typeof createCloudApiServer> | null = null;
  let port = 0;

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server?.close((err) => (err ? reject(err) : resolve()));
      });
      server = null;
    }
  });

  async function startServer(deps: CloudApiDependencies): Promise<string> {
    server = createCloudApiServer(deps);
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    port = typeof address === 'object' && address ? address.port : 0;
    return `http://127.0.0.1:${port}`;
  }

  it('POST /v1/experiments creates an experiment and rejects Hard Line H6 guarantee copy', async () => {
    const { dependencies } = createDependencies();
    const baseUrl = await startServer(dependencies);

    // Rejection of H6 prohibited guarantee in variant content
    const badRes = await fetch(`${baseUrl}/v1/experiments`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Bad Headline Experiment',
        targetDimension: 'cv_headline',
        variants: [
          { name: 'A', content: 'Standard Headline' },
          { name: 'B', content: 'Guaranteed 100% interview offer headline' },
        ],
      }),
    });

    expect(badRes.status).toBe(400);
    const badJson = await badRes.json();
    expect(badJson.error).toContain('Hard Line H6 Violation');

    // Compliant experiment creation
    const goodRes = await fetch(`${baseUrl}/v1/experiments`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        name: 'Technical Headline A/B Test',
        targetDimension: 'cv_headline',
        minSampleSize: 30,
        variants: [
          { id: 'v1', name: 'Microservices', content: 'Staff Engineer | Microservices' },
          { id: 'v2', name: 'Distributed Systems', content: 'Staff Engineer | Distributed Systems' },
        ],
      }),
    });

    expect(goodRes.status).toBe(201);
    const goodJson = await goodRes.json();
    expect(goodJson.experiment.name).toBe('Technical Headline A/B Test');
    expect(goodJson.experiment.variants).toHaveLength(2);
  });

  it('POST /v1/experiments/event records metrics and GET /v1/experiments evaluates results', async () => {
    const { dependencies, experimentsStore } = createDependencies();
    const baseUrl = await startServer(dependencies);

    // Create experiment directly in store with samples
    experimentsStore.push({
      id: 'exp-test',
      tenantId,
      name: 'Outreach Hook Experiment',
      targetDimension: 'outreach_hook',
      status: 'running',
      minSampleSize: 30,
      variants: [
        { id: 'hook_a', name: 'Direct Ask', content: 'Ask hook', allocationWeight: 0.5, impressions: 40, conversions: 4 },
        { id: 'hook_b', name: 'Technical Depth', content: 'Tech hook', allocationWeight: 0.5, impressions: 40, conversions: 12 },
      ],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    // Record an additional conversion event
    const eventRes = await fetch(`${baseUrl}/v1/experiments/event`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        experimentId: 'exp-test',
        variantId: 'hook_b',
        eventType: 'conversion',
      }),
    });

    expect(eventRes.status).toBe(200);

    // List and evaluate
    const listRes = await fetch(`${baseUrl}/v1/experiments`, {
      method: 'GET',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
      },
    });

    expect(listRes.status).toBe(200);
    const listJson = await listRes.json();
    expect(listJson.experiments).toHaveLength(1);
    expect(listJson.evaluations).toHaveLength(1);
    expect(listJson.evaluations[0].hasMinimumSample).toBe(true);
  });

  it('GET /v1/analytics/funnel aggregates conversion and velocity metrics', async () => {
    const { dependencies } = createDependencies();
    const baseUrl = await startServer(dependencies);

    const res = await fetch(`${baseUrl}/v1/analytics/funnel`, {
      method: 'GET',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.funnelReport.counts.appliedOrContacted).toBe(22); // 2 apps + 20 outreach
    expect(json.funnelReport.counts.interviewsScheduled).toBe(1);
    expect(json.funnelReport.conversionRates.replyRate).toBeGreaterThan(0);
    expect(json.funnelReport.velocity.timeToFirstApplicationHours).toBe(2.5);
  });

  it('POST /v1/privacy/dsar/export and POST /v1/privacy/dsar/delete', async () => {
    const { dependencies } = createDependencies();
    const baseUrl = await startServer(dependencies);

    // DSAR Export
    const exportRes = await fetch(`${baseUrl}/v1/privacy/dsar/export`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
      },
    });

    expect(exportRes.status).toBe(200);
    const exportJson = await exportRes.json();
    expect(exportJson.exportPackage.integrityChecksumSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(exportJson.exportPackage.data.confirmedFacts).toHaveLength(1);
    expect(exportJson.exportPackage.data.applications).toHaveLength(2);

    // DSAR Erasure
    const deleteRes = await fetch(`${baseUrl}/v1/privacy/dsar/delete`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
      },
    });

    expect(deleteRes.status).toBe(200);
    const deleteJson = await deleteRes.json();
    expect(deleteJson.receipt.recordsPurged.careerGraphFacts).toBe(5);
    expect(deleteJson.receipt.deletionAuditSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(deleteJson.receipt.complianceNotice).toContain('GDPR Article 17');
  });

  it('GET /v1/billing/usage returns current tenant usage vs tier limits', async () => {
    const { dependencies } = createDependencies();
    const baseUrl = await startServer(dependencies);

    const res = await fetch(`${baseUrl}/v1/billing/usage?tier=sprint_pro`, {
      method: 'GET',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.tier).toBe('sprint_pro');
    expect(json.usage.applicationsThisMonth).toBe(2);
    expect(json.quotas.apply.allowed).toBe(true);
  });
});

