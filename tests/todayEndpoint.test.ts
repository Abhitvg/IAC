import { once } from 'node:events';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { CloudApiDependencies } from '../apps/api/src/ports';
import { createCloudApiServer } from '../apps/api/src/server';
import type { ApplicationRecord, ActivityFeedEvent } from '../packages/cloud-core/src/tracker';

const tenantId = '10000000-0000-4000-8000-000000000001';
const subject = 'candidate:alice';

const sampleApp: ApplicationRecord = {
  id: '20000000-0000-4000-8000-000000000001',
  tenantId,
  company: 'Anthropic',
  role: 'Systems Engineer',
  status: 'evaluated',
  channel: 'ats',
  score: 4.8,
  metadata: {},
  createdBy: subject,
  createdAt: '2026-11-12T00:00:00.000Z',
  updatedAt: '2026-11-12T00:00:00.000Z',
};

const sampleActivity: ActivityFeedEvent = {
  id: '40000000-0000-4000-8000-000000000001',
  tenantId,
  eventType: 'outreach_sent',
  severity: 'info',
  title: 'Outreach Sent to Alex Vance (Stripe)',
  description: 'Sent referral inquiry message referencing shared alumni network.',
  actorSubject: subject,
  metadata: {
    company: 'Stripe',
    role: 'Backend Engineer',
    evidenceRefs: ['CMU Alumni', 'Distributed Systems Experience'],
  },
  createdAt: new Date().toISOString(),
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
      createApplication: vi.fn(),
      getApplication: vi.fn(),
      listApplications: vi.fn(async () => [sampleApp]),
      transitionApplication: vi.fn(),
      getApplicationTimeline: vi.fn(async () => []),
      appendActivityEvent: vi.fn(async (tId, actor, evt) => ({
        id: 'act-undone-1',
        tenantId: tId,
        actorSubject: actor,
        createdAt: new Date().toISOString(),
        ...evt,
      })),
      listActivityEvents: vi.fn(async () => [sampleActivity]),
      getDashboardMetrics: vi.fn(async () => ({
        totalTracked: 1,
        statusCounts: { evaluated: 1 } as any,
        appliedCount: 0,
        interviewingCount: 0,
        offerCount: 0,
        rejectedCount: 0,
        withdrawnCount: 0,
        todayAppliedCount: 1,
        dailyApplicationCap: 25,
        applicationCapRemaining: 24,
        interviewConversionRate: 0,
        channelDistribution: { ats: 1, email: 0, linkedin_assist: 0, calendar: 0 },
      })),
      withdrawApplication: vi.fn(),
    },
  };
}

describe('CareerOps GET /v1/today Endpoint', () => {
  let server: ReturnType<typeof createCloudApiServer> | null = null;
  let port = 0;

  afterEach(async () => {
    if (server) {
      server.close();
      await once(server, 'close');
      server = null;
    }
  });

  it('returns actions taken since last visit with plain-language reasons and evidence', async () => {
    const dependencies = createDependencies();
    server = createCloudApiServer(dependencies);
    server.listen(0);
    await once(server, 'listening');
    port = (server.address() as any).port;

    const res = await fetch(`http://127.0.0.1:${port}/v1/today`, {
      headers: { authorization: 'Bearer test-token' },
    });
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.actionsTakenSinceLastVisit.length).toBeGreaterThan(0);
    const action = body.actionsTakenSinceLastVisit[0];
    expect(action.title).toContain('Outreach Sent');
    expect(action.reason).toContain('Sent referral inquiry');
    expect(action.evidenceRefs).toEqual(['CMU Alumni', 'Distributed Systems Experience']);
    expect(action.canUndo).toBe(true);

    // Health metrics
    expect(body.health.mailHealthStatus).toBe('healthy');
    expect(body.health.dailyApplicationCap).toBe(25);
    expect(body.health.applicationsUsedToday).toBe(1);

    // Calibrated forecast (H6 compliant)
    expect(body.forecast.projectedInterviewsMin).toBeGreaterThanOrEqual(1);
    expect(body.forecast.sampleSize).toBeGreaterThanOrEqual(30);
    expect(body.forecast.calibrationNotes).toContain('do not constitute an outcome guarantee');

    // Actions needing user
    expect(body.actionsNeedingUser.length).toBeGreaterThan(0);
    expect(body.actionsNeedingUser[0].type).toBe('review_tailored_cv');
  });

  it('allows revoking an action via POST /v1/actions/:id/undo', async () => {
    const dependencies = createDependencies();
    server = createCloudApiServer(dependencies);
    server.listen(0);
    await once(server, 'listening');
    port = (server.address() as any).port;

    const res = await fetch(`http://127.0.0.1:${port}/v1/actions/${sampleActivity.id}/undo`, {
      method: 'POST',
      headers: { authorization: 'Bearer test-token' },
    });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.status).toBe('undone');
    expect(dependencies.applicationTracker?.appendActivityEvent).toHaveBeenCalledWith(
      tenantId,
      subject,
      expect.objectContaining({
        eventType: 'action_undone',
      })
    );
  });
});
