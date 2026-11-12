import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudApiDependencies } from '../apps/api/src/ports';
import { createCloudApiServer } from '../apps/api/src/server';
import type { SprintContract } from '../packages/cloud-core/src/contract';
import type {
  AllocationArm,
  AutoPauseEvent,
  SprintMetrics,
  SprintRun,
  SprintStatus,
} from '../packages/cloud-core/src/sprint/types';

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
  sprintStore: { sprint: SprintRun; arms: AllocationArm[] } | null;
  autoPauseEvents: AutoPauseEvent[];
  setChannelPauseSpy: any;
} {
  let sprintStore: { sprint: SprintRun; arms: AllocationArm[] } | null = null;
  const autoPauseEvents: AutoPauseEvent[] = [];
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
    sprint: {
      createSprint: vi.fn(async (_t, sprint, arms) => {
        sprintStore = { sprint, arms };
        return sprint;
      }),
      getSprint: vi.fn(async () => sprintStore),
      getActiveSprint: vi.fn(async () => sprintStore),
      updateSprintMetrics: vi.fn(async (_t, _id, metrics) => {
        if (!sprintStore) throw new Error('Not found');
        sprintStore.sprint.metrics = { ...sprintStore.sprint.metrics, ...metrics };
        return sprintStore.sprint;
      }),
      updateSprintStatus: vi.fn(async (_t, _id, status) => {
        if (!sprintStore) throw new Error('Not found');
        sprintStore.sprint.status = status;
        return sprintStore.sprint;
      }),
      saveAllocations: vi.fn(async (_t, _id, arms) => {
        if (sprintStore) sprintStore.arms = arms;
      }),
      recordAutoPauseEvent: vi.fn(async (_t, event) => {
        autoPauseEvents.push(event);
      }),
      getAutoPauseEvents: vi.fn(async () => autoPauseEvents),
    },
  };

  return {
    dependencies,
    get sprintStore() {
      return sprintStore;
    },
    autoPauseEvents,
    setChannelPauseSpy,
  };
}

describe('Milestone M9 - Sprint Mode Orchestrator & Forecast API', () => {
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

  it('POST /v1/sprint/start creates a sprint and rejects Hard Line H6 outcome guarantees', async () => {
    const { dependencies } = createDependencies();
    const baseUrl = await startServer(dependencies);

    // Attempt to start a sprint with a forbidden guarantee note (H6 violation)
    const badRes = await fetch(`${baseUrl}/v1/sprint/start`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targetDurationHours: 72,
        marketingNote: 'We offer a 100% guarantee that you get an offer.',
      }),
    });

    expect(badRes.status).toBe(400);
    const badJson = await badRes.json();
    expect(badJson.error).toContain('Hard Line H6 Violation');

    // Start a compliant sprint
    const goodRes = await fetch(`${baseUrl}/v1/sprint/start`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        targetRoles: ['Staff Backend Engineer'],
        targetDurationHours: 72,
      }),
    });

    expect(goodRes.status).toBe(201);
    const goodJson = await goodRes.json();
    expect(goodJson.sprint.status).toBe('active');
    expect(goodJson.phase).toBe('T0_INITIALIZING');
    expect(goodJson.forecast.expectedInterviewsMax).toBeGreaterThanOrEqual(1);
    expect(goodJson.forecast.hardLineH6Notice).toContain('HARD LINE H6 COMPLIANCE');
  });

  it('GET /v1/sprint/current returns active sprint and auto-pause status', async () => {
    const { dependencies } = createDependencies();
    const baseUrl = await startServer(dependencies);

    // Start sprint
    await fetch(`${baseUrl}/v1/sprint/start`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ targetDurationHours: 72 }),
    });

    const res = await fetch(`${baseUrl}/v1/sprint/current`, {
      method: 'GET',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
      },
    });

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json.sprint).toBeDefined();
    expect(json.sprint.status).toBe('active');
    expect(json.autoPause.shouldPause).toBe(false);
  });

  it('POST /v1/sprint/pause and POST /v1/sprint/resume manage lifecycle', async () => {
    const { dependencies } = createDependencies();
    const baseUrl = await startServer(dependencies);

    await fetch(`${baseUrl}/v1/sprint/start`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ targetDurationHours: 72 }),
    });

    // Pause
    const pauseRes = await fetch(`${baseUrl}/v1/sprint/pause`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
      },
    });
    expect(pauseRes.status).toBe(200);
    const pauseJson = await pauseRes.json();
    expect(pauseJson.sprint.status).toBe('paused');

    // Resume
    const resumeRes = await fetch(`${baseUrl}/v1/sprint/resume`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
      },
    });
    expect(resumeRes.status).toBe(200);
    const resumeJson = await resumeRes.json();
    expect(resumeJson.sprint.status).toBe('active');
  });

  it('POST /v1/sprint/trigger-event activates auto-pause and sets channel pause in controls', async () => {
    const { dependencies, setChannelPauseSpy, autoPauseEvents } = createDependencies();
    const baseUrl = await startServer(dependencies);

    await fetch(`${baseUrl}/v1/sprint/start`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ targetDurationHours: 72 }),
    });

    // Trigger bounce spike alert
    const triggerRes = await fetch(`${baseUrl}/v1/sprint/trigger-event`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        metrics: {
          emailOutreachSent: 20,
          emailBounces: 2, // 10% > 5%
        },
      }),
    });

    expect(triggerRes.status).toBe(200);
    const triggerJson = await triggerRes.json();
    expect(triggerJson.result.shouldPause).toBe(true);
    expect(triggerJson.result.affectedChannels).toEqual(['email']);

    // Proves channel was auto-paused
    expect(setChannelPauseSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        tenantId,
        channel: 'email',
        paused: true,
      })
    );
    expect(autoPauseEvents.length).toBeGreaterThanOrEqual(1);
  });

  it('POST /v1/sprint/rebalance and GET /v1/sprint/report', async () => {
    const { dependencies } = createDependencies();
    const baseUrl = await startServer(dependencies);

    await fetch(`${baseUrl}/v1/sprint/start`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ targetDurationHours: 72 }),
    });

    // Rebalance bandit arms
    const rebalanceRes = await fetch(`${baseUrl}/v1/sprint/rebalance`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
      },
    });
    expect(rebalanceRes.status).toBe(200);
    const rebalanceJson = await rebalanceRes.json();
    expect(rebalanceJson.updatedAllocations.length).toBeGreaterThan(0);

    // Get final report
    const reportRes = await fetch(`${baseUrl}/v1/sprint/report`, {
      method: 'GET',
      headers: {
        authorization: 'Bearer valid-token',
        'x-tenant-id': tenantId,
      },
    });
    expect(reportRes.status).toBe(200);
    const reportJson = await reportRes.json();
    expect(reportJson.report.funnel).toBeDefined();
    expect(reportJson.report.durationHours).toBe(72);
  });
});
