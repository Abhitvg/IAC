import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudApiDependencies } from '../apps/api/src/ports';
import { createCloudApiServer } from '../apps/api/src/server';
import { SprintWorkflowActivities } from '../packages/cloud-core/src/workflows/activities';
import { UnattendedSprintScheduler } from '../packages/cloud-core/src/workflows/scheduler';
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
  suppressionStore: string[];
  mailboxMetrics: { sentCount: number; bounceCount: number; complaintCount: number; replyCount: number };
} {
  const setChannelPauseSpy = vi.fn(async () => undefined);
  const suppressionStore: string[] = [];
  const mailboxMetrics = { sentCount: 10, bounceCount: 0, complaintCount: 0, replyCount: 2 };

  let activeSprint = {
    sprint: {
      id: 'sprint_active_001',
      tenantId,
      status: 'active' as const,
      targetDurationHours: 72,
      startedAt: new Date().toISOString(),
      config: {
        targetRoles: ['Staff Backend Engineer'],
        enabledChannels: ['ats', 'email'] as any,
        targetDurationHours: 72,
      },
      metrics: {
        discoveredJobsCount: 20,
        evaluatedJobsCount: 15,
        tailoredArtifactsCount: 10,
        atsApplicationsSubmitted: 4,
        atsApplicationsFailed: 0,
        emailOutreachSent: 10,
        emailBounces: 0,
        emailComplaints: 0,
        emailRepliesReceived: 2,
        negativeReplies: 0,
        referralsInitiated: 0,
        linkedinAssistItemsGenerated: 0,
        truthfulnessGateChecks: 10,
        truthfulnessGateFailures: 0,
        interviewsScheduled: 1,
      },
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    arms: [
      {
        channel: 'email' as const,
        targetRole: 'Staff Backend Engineer',
        templateId: 'technical_depth_hook',
        weight: 1.0,
        pulls: 10,
        successes: 2,
        status: 'active' as const,
      },
    ],
  };

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
        tenantId,
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
      acceptSprintContract: async () => ({ id: 'c-1', revision: 1 }),
      getActiveSprintContract: async () => ({
        id: 'c-1',
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
    applicationTracker: {
      createApplication: vi.fn(),
      getApplication: vi.fn(),
      listApplications: vi.fn(async () => []),
      transitionApplication: vi.fn(),
    },
    outreach: {
      addPerson: vi.fn(),
      listPeople: vi.fn(async () => []),
      getPerson: vi.fn(),
      updatePersonStage: vi.fn(),
      addSuppression: vi.fn(async (_t, record) => {
        suppressionStore.push(record.email);
      }),
      isSuppressed: vi.fn(async (_t, email) => suppressionStore.includes(email)),
      logOutreachMessage: vi.fn(),
      countCompanyContactsForRole: vi.fn(async () => 0),
      getMailboxMetrics: vi.fn(async () => mailboxMetrics),
    },
    sprint: {
      createSprint: vi.fn(async (_t, sprint) => sprint),
      getSprint: vi.fn(async () => activeSprint),
      getActiveSprint: vi.fn(async () => activeSprint),
      updateSprintMetrics: vi.fn(async (_t, _id, metrics) => {
        activeSprint.sprint.metrics = { ...activeSprint.sprint.metrics, ...metrics };
        return activeSprint.sprint;
      }),
      updateSprintStatus: vi.fn(async (_t, _id, status) => {
        activeSprint.sprint.status = status;
        return activeSprint.sprint;
      }),
      saveAllocations: vi.fn(),
      recordAutoPauseEvent: vi.fn(),
      getAutoPauseEvents: vi.fn(async () => []),
    },
  };

  return { dependencies, setChannelPauseSpy, suppressionStore, mailboxMetrics };
}

describe('Milestone M11 Item 2: Temporal Workflows, Unattended Execution & Verified Provider Webhooks', () => {
  let server: ReturnType<typeof createCloudApiServer> | null = null;
  let baseUrl = '';

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
    const port = typeof address === 'object' && address ? address.port : 0;
    baseUrl = `http://127.0.0.1:${port}`;
    return baseUrl;
  }

  it('runs unattended workflow ticks across lifecycle phases without human approvals', async () => {
    const { dependencies } = createDependencies();
    const activities = new SprintWorkflowActivities({
      sprintRepository: dependencies.sprint,
      controlsRepository: dependencies.repository,
      outreachRepository: dependencies.outreach,
    });
    const scheduler = new UnattendedSprintScheduler(activities);

    const input = {
      tenantId,
      sprintId: 'sprint_active_001',
      config: {
        targetRoles: ['Staff Backend Engineer'],
        enabledChannels: ['ats', 'email'] as any,
        targetDurationHours: 72,
      },
      targetDurationHours: 72,
    };

    // 1. Tick at T+2h (Discovery phase)
    const tickT2 = await scheduler.executeTick(input, 2.0);
    expect(tickT2.state.status).toBe('active');
    expect(tickT2.results.some((r) => r.waveType === 'discovery')).toBe(true);
    expect(tickT2.results.some((r) => r.waveType === 'inbox')).toBe(true);

    // 2. Tick at T+10h (Active waves phase: apply + outreach + inbox)
    const tickT10 = await scheduler.executeTick(input, 10.0);
    expect(tickT10.state.status).toBe('active');
    expect(tickT10.results.some((r) => r.waveType === 'apply')).toBe(true);
    expect(tickT10.results.some((r) => r.waveType === 'outreach')).toBe(true);
    expect(tickT10.results.some((r) => r.waveType === 'inbox')).toBe(true);

    // 3. Tick at T+24h (Daily bandit rebalancing)
    const tickT24 = await scheduler.executeTick(input, 24.0);
    expect(tickT24.results.some((r) => r.waveType === 'rebalance')).toBe(true);

    // 4. Tick at T+72h (Sprint concluded)
    const tickT72 = await scheduler.executeTick(input, 72.0);
    expect(tickT72.state.status).toBe('completed');
  });

  it('POST /v1/webhooks/email/bounce ingests verified provider bounce, suppresses email, and auto-pauses if >5%', async () => {
    const { dependencies, setChannelPauseSpy, suppressionStore, mailboxMetrics } = createDependencies();
    const url = await startServer(dependencies);

    // Set metrics so 1 bounce will cause bounce rate to exceed 5% (1 / 10 = 10%)
    mailboxMetrics.sentCount = 10;
    mailboxMetrics.bounceCount = 0;

    const res = await fetch(`${url}/v1/webhooks/email/bounce`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'invalid-target@domain.test',
        reason: '550 User unknown',
        diagnosticCode: 'smtp; 550 5.1.1',
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('processed');
    expect(json.bouncedEmail).toBe('invalid-target@domain.test');
    expect(json.currentBounceRate).toBe(0.1); // 10%
    expect(json.autoPaused).toBe(true);

    // Verified: suppressed in DB
    expect(suppressionStore).toContain('invalid-target@domain.test');

    // Verified: auto-paused in controls repository
    expect(setChannelPauseSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        channel: 'email',
        paused: true,
      })
    );
  });

  it('POST /v1/webhooks/email/complaint immediately auto-pauses email channel (0 tolerance)', async () => {
    const { dependencies, setChannelPauseSpy, suppressionStore } = createDependencies();
    const url = await startServer(dependencies);

    const res = await fetch(`${url}/v1/webhooks/email/complaint`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        email: 'unhappy-recipient@domain.test',
        feedbackType: 'abuse',
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('processed');
    expect(json.autoPaused).toBe(true);

    expect(suppressionStore).toContain('unhappy-recipient@domain.test');
    expect(setChannelPauseSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        channel: 'email',
        paused: true,
      })
    );
  });

  it('POST /v1/webhooks/ats/result tracks submission errors and auto-pauses ATS when failure rate > 15%', async () => {
    const { dependencies, setChannelPauseSpy } = createDependencies();
    const url = await startServer(dependencies);

    // Report a failed submission: total submissions = 4 submitted + 1 failed = 5 total. Error rate = 1/5 = 20% > 15%
    const res = await fetch(`${url}/v1/webhooks/ats/result`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        applicationId: 'app_ats_001',
        status: 'failed',
        errorMessage: 'Selector change detected on career site',
      }),
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.status).toBe('processed');
    expect(json.atsErrorRate).toBe(0.2); // 20% > 15%
    expect(json.autoPaused).toBe(true);

    expect(setChannelPauseSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        channel: 'ats',
        paused: true,
      })
    );
  });
});
