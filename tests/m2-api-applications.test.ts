import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudApiDependencies } from '../apps/api/src/ports';
import { createCloudApiServer } from '../apps/api/src/server';
import type {
  ApplicationRecord,
  ApplicationTimelineEvent,
  ActivityFeedEvent,
  DashboardMetrics,
} from '../packages/cloud-core/src/tracker';

const tenantId = '10000000-0000-4000-8000-000000000001';
const subject = 'candidate:alice';

const sampleApp: ApplicationRecord = {
  id: '20000000-0000-4000-8000-000000000001',
  tenantId,
  company: 'Anthropic',
  role: 'Systems Engineer',
  status: 'scouted',
  channel: 'ats',
  score: 4.8,
  metadata: {},
  createdBy: subject,
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const sampleTimeline: ApplicationTimelineEvent = {
  id: '30000000-0000-4000-8000-000000000001',
  tenantId,
  applicationId: sampleApp.id,
  fromStatus: null,
  toStatus: 'scouted',
  reason: 'Initial discovery',
  actorSubject: subject,
  metadata: {},
  createdAt: '2026-11-12T00:00:00.000Z',
};

const sampleActivity: ActivityFeedEvent = {
  id: '40000000-0000-4000-8000-000000000001',
  tenantId,
  eventType: 'application.created',
  severity: 'info',
  title: 'Tracked Anthropic',
  description: 'Systems Engineer scouted',
  actorSubject: subject,
  metadata: {},
  createdAt: '2026-11-12T00:00:00.000Z',
};

function createDependencies(): CloudApiDependencies {
  let apps = [sampleApp];

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
      getActiveSprintContract: async () => null,
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
      createApplication: vi.fn(async (tId, actor, input) => {
        if (apps.some((a) => a.company === input.company && a.role === input.role)) {
          throw new Error(
            `Duplicate application guard: already tracking ${input.company} - ${input.role}`
          );
        }
        const created: ApplicationRecord = {
          id: '20000000-0000-4000-8000-000000000099',
          tenantId: tId,
          company: input.company,
          role: input.role,
          status: 'scouted',
          channel: input.channel,
          score: input.score,
          metadata: input.metadata,
          createdBy: actor,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        };
        apps.push(created);
        return created;
      }),
      getApplication: vi.fn(async (tId, id) => {
        return apps.find((a) => a.id === id) ?? null;
      }),
      listApplications: vi.fn(async () => apps),
      transitionApplication: vi.fn(async (tId, actor, id, req) => {
        const app = apps.find((a) => a.id === id);
        if (!app) throw new Error('Application not found');
        app.status = req.toStatus;
        return app;
      }),
      withdrawApplication: vi.fn(async (tId, actor, id, reason) => {
        const app = apps.find((a) => a.id === id);
        if (!app) throw new Error('Application not found');
        app.status = 'withdrawn';
        return app;
      }),
      getApplicationTimeline: vi.fn(async () => [sampleTimeline]),
      getDashboardMetrics: vi.fn(async () => ({
        totalTracked: apps.length,
        statusCounts: {
          scouted: 1,
          evaluated: 0,
          tailored: 0,
          queued: 0,
          submitting: 0,
          applied: 0,
          outreach_sent: 0,
          replied: 0,
          interviewing: 0,
          offer: 0,
          rejected: 0,
          withdrawn: 0,
          archived: 0,
        },
        appliedCount: 0,
        interviewingCount: 0,
        offerCount: 0,
        rejectedCount: 0,
        withdrawnCount: 0,
        todayAppliedCount: 0,
        dailyApplicationCap: 25,
        applicationCapRemaining: 25,
        interviewConversionRate: 0,
        channelDistribution: { ats: 1, email: 0, linkedin_assist: 0, calendar: 0 },
      })),
      appendActivityEvent: vi.fn(async () => sampleActivity),
      listActivityEvents: vi.fn(async () => [sampleActivity]),
    },
  };
}

describe('M2: Application Tracker and Activity Feed API Routes', () => {
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

  it('creates and lists applications', async () => {
    await startServer();

    // List applications
    const listRes = await fetch(`${baseUrl}/v1/applications`, {
      headers: { authorization: 'Bearer token' },
    });
    expect(listRes.status).toBe(200);
    const listData = (await listRes.json()) as any;
    expect(listData.count).toBe(1);
    expect(listData.applications[0].company).toBe('Anthropic');

    // Create a new application
    const createRes = await fetch(`${baseUrl}/v1/applications`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        company: 'OpenAI',
        role: 'Research Engineer',
        channel: 'ats',
        score: 4.5,
      }),
    });
    expect(createRes.status).toBe(201);
    const createdData = (await createRes.json()) as any;
    expect(createdData.application.company).toBe('OpenAI');
  });

  it('rejects duplicate applications with 409 Conflict', async () => {
    await startServer();

    const res = await fetch(`${baseUrl}/v1/applications`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        company: 'Anthropic',
        role: 'Systems Engineer', // Duplicate!
      }),
    });

    expect(res.status).toBe(409);
    const err = (await res.json()) as any;
    expect(err.error).toContain('Duplicate application guard');
  });

  it('gets application details with timeline', async () => {
    await startServer();

    const res = await fetch(`${baseUrl}/v1/applications/${sampleApp.id}`, {
      headers: { authorization: 'Bearer token' },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.application.id).toBe(sampleApp.id);
    expect(data.timeline).toHaveLength(1);
    expect(data.timeline[0].toStatus).toBe('scouted');
  });

  it('transitions application status', async () => {
    await startServer();

    const res = await fetch(`${baseUrl}/v1/applications/${sampleApp.id}/transition`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        toStatus: 'evaluated',
      }),
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.application.status).toBe('evaluated');
  });

  it('withdraws application with required reason', async () => {
    await startServer();

    // Withdraw with empty reason fails
    const failRes = await fetch(`${baseUrl}/v1/applications/${sampleApp.id}/withdraw`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ reason: '' }),
    });
    expect(failRes.status).toBe(400);

    // Withdraw with reason succeeds
    const okRes = await fetch(`${baseUrl}/v1/applications/${sampleApp.id}/withdraw`, {
      method: 'POST',
      headers: {
        authorization: 'Bearer token',
        'content-type': 'application/json',
      },
      body: JSON.stringify({ reason: 'Position no longer accepting remote work' }),
    });
    expect(okRes.status).toBe(200);
    const data = (await okRes.json()) as any;
    expect(data.application.status).toBe('withdrawn');
  });

  it('retrieves dashboard stats', async () => {
    await startServer();

    const res = await fetch(`${baseUrl}/v1/dashboard/stats`, {
      headers: { authorization: 'Bearer token' },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.metrics.dailyApplicationCap).toBe(25);
    expect(data.metrics.totalTracked).toBeGreaterThanOrEqual(1);
  });

  it('retrieves activity feed events', async () => {
    await startServer();

    const res = await fetch(`${baseUrl}/v1/activity-feed`, {
      headers: { authorization: 'Bearer token' },
    });
    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.count).toBe(1);
    expect(data.events[0].eventType).toBe('application.created');
  });

  it('connects to real-time activity feed SSE stream', async () => {
    await startServer();

    const res = await fetch(`${baseUrl}/v1/activity-feed/stream`, {
      headers: { authorization: 'Bearer token' },
    });

    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    expect(res.headers.get('cache-control')).toContain('no-cache');

    // Read initial stream chunk
    const reader = res.body?.getReader();
    expect(reader).toBeDefined();
    const chunk = await reader?.read();
    const text = new TextDecoder().decode(chunk?.value);
    expect(text).toContain('event: ready');
    expect(text).toContain(tenantId);
    await reader?.cancel();
  });
});
