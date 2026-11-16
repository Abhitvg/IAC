import { describe, expect, it, vi } from 'vitest';
import type { CloudApiRepository, LinkedInCloudIntegration } from '../apps/api/src/ports';
import { LinkedInApiError } from '../apps/api/src/linkedin/client';
import {
  LinkedInScheduledPostStore,
  LinkedInScheduledPostWorker,
  type ScheduledLinkedInPost,
  type LinkedInScheduleSqlPool,
} from '../apps/api/src/linkedin/scheduled-posts';
import type { LinkedInTokenSet } from '../apps/api/src/linkedin/types';

const scheduledPost: ScheduledLinkedInPost = {
  id: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  subject: 'member:careerops-test',
  commentary: 'A reviewed LinkedIn post.',
  scheduledAt: new Date(Date.now() + 10 * 60_000).toISOString(),
  nextAttemptAt: new Date().toISOString(),
  status: 'processing',
  attemptCount: 1,
  publishedPostUrn: null,
  errorCode: null,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

const token: LinkedInTokenSet = {
  accessToken: 'test-access-token',
  memberId: 'member-urn',
  expiresAt: Date.now() + 60 * 60_000,
  grantedScopes: ['openid', 'profile', 'w_member_social'],
  tokenType: 'Bearer',
};

function makeWorker(overrides?: {
  controls?: { globalKillSwitch: boolean; pausedChannels: string[]; tenantId?: string };
  memberships?: Array<{ tenantId: string; subject: string; role: string; status: string }>;
  publish?: () => Promise<{ id: string; status: number }>;
  token?: LinkedInTokenSet | null;
  getControls?: () => Promise<{
    tenantId: string;
    globalKillSwitch: boolean;
    pausedChannels: string[];
    updatedAt: string;
  }>;
}) {
  const store = {
    claimDue: vi.fn(async () => [scheduledPost]),
    defer: vi.fn(async () => undefined),
    markPublished: vi.fn(async () => undefined),
    markFailed: vi.fn(async () => undefined),
    markUnknownOutcome: vi.fn(async () => undefined),
    markNeedsReview: vi.fn(async () => undefined),
  } as unknown as LinkedInScheduledPostStore;
  const integration = {
    oauth: {
      getValidToken: vi.fn(async () =>
        overrides?.token === null ? null : (overrides?.token ?? token)
      ),
    },
    api: {
      publishMemberTextPost: vi.fn(
        overrides?.publish ??
          (async () => ({
            id: 'urn:li:share:published',
            status: 201,
          }))
      ),
    },
  } as unknown as LinkedInCloudIntegration;
  const getControlState =
    overrides?.getControls ??
    (async () => ({
      tenantId: scheduledPost.tenantId,
      globalKillSwitch: overrides?.controls?.globalKillSwitch ?? false,
      pausedChannels: overrides?.controls?.pausedChannels ?? [],
      updatedAt: new Date().toISOString(),
    }));
  const repository = {
    getControlState: vi.fn(getControlState),
    findMembershipsBySubject: vi.fn(
      async () =>
        overrides?.memberships ?? [
          {
            tenantId: scheduledPost.tenantId,
            subject: scheduledPost.subject,
            role: 'owner',
            status: 'active',
          },
        ]
    ),
    recordLinkedInAction: vi.fn(async () => undefined),
  } as unknown as CloudApiRepository;
  const worker = new LinkedInScheduledPostWorker(store, integration, repository, 15_000, 10);
  return { worker, store, integration, repository };
}

describe('LinkedIn scheduled post execution', () => {
  it('binds worker state transitions to the claimed tenant and member', async () => {
    const query = vi.fn(async () => ({ rows: [{ changed: true }] }));
    const release = vi.fn();
    const pool = {
      connect: async () => ({ query, release }),
    } as unknown as LinkedInScheduleSqlPool;
    const store = new LinkedInScheduledPostStore(pool);

    await store.markPublished(scheduledPost, 'urn:li:share:published');

    expect(query).toHaveBeenCalledWith(
      'SELECT transition_linkedin_scheduled_post($1, $2, $3, $4, $5, $6, $7) AS changed',
      [
        scheduledPost.id,
        scheduledPost.tenantId,
        scheduledPost.subject,
        'published',
        'urn:li:share:published',
        null,
        null,
      ]
    );
    expect(release).toHaveBeenCalledOnce();
  });

  it('publishes one post and persists the returned LinkedIn URN when tenant controls allow it', async () => {
    const { worker, store, integration, repository } = makeWorker();

    await worker.runOnce();

    expect(repository.recordLinkedInAction).toHaveBeenCalledOnce();
    expect(integration.api.publishMemberTextPost).toHaveBeenCalledWith(
      token,
      'urn:li:person:member-urn',
      scheduledPost.commentary
    );
    expect(store.markPublished).toHaveBeenCalledWith(scheduledPost, 'urn:li:share:published');
  });

  it('defers without publishing when the tenant pauses LinkedIn', async () => {
    const { worker, store, integration } = makeWorker({
      controls: { globalKillSwitch: false, pausedChannels: ['linkedin_assist'] },
    });

    await worker.runOnce();

    expect(store.defer).toHaveBeenCalledWith(scheduledPost, 60);
    expect(integration.api.publishMemberTextPost).not.toHaveBeenCalled();
  });

  it('fails without publishing if the member no longer belongs to the scheduled tenant', async () => {
    const { worker, store, integration } = makeWorker({ memberships: [] });

    await worker.runOnce();

    expect(store.markFailed).toHaveBeenCalledWith(scheduledPost, 'tenant_membership_inactive');
    expect(integration.api.publishMemberTextPost).not.toHaveBeenCalled();
  });

  it('marks an ambiguous external result unknown instead of retrying a possibly accepted post', async () => {
    const { worker, store, integration } = makeWorker({
      publish: async () => {
        throw new Error('socket closed after request dispatch');
      },
    });

    await worker.runOnce();

    expect(integration.api.publishMemberTextPost).toHaveBeenCalledOnce();
    expect(store.markUnknownOutcome).toHaveBeenCalledWith(
      scheduledPost,
      'linkedin_publish_outcome_unknown'
    );
    expect(store.defer).not.toHaveBeenCalled();
  });

  it('retries an explicit LinkedIn 429 only within the bounded attempt count', async () => {
    const { worker, store } = makeWorker({
      publish: async () => {
        throw new LinkedInApiError('Rate limited', 429, 45);
      },
    });

    await worker.runOnce();

    expect(store.defer).toHaveBeenCalledWith(scheduledPost, 45);
    expect(store.markUnknownOutcome).not.toHaveBeenCalled();
  });

  it('defers without publishing while the tenant-wide kill switch is enabled', async () => {
    const { worker, store, integration } = makeWorker({
      controls: { globalKillSwitch: true, pausedChannels: [] },
    });

    await worker.runOnce();

    expect(store.defer).toHaveBeenCalledWith(scheduledPost, 60);
    expect(integration.api.publishMemberTextPost).not.toHaveBeenCalled();
  });

  it('re-checks pause controls immediately before the LinkedIn side effect', async () => {
    let reads = 0;
    const { worker, store, integration } = makeWorker({
      getControls: async () => {
        reads += 1;
        return {
          tenantId: scheduledPost.tenantId,
          globalKillSwitch: false,
          pausedChannels: reads === 2 ? ['linkedin_assist'] : [],
          updatedAt: new Date().toISOString(),
        };
      },
    });

    await worker.runOnce();

    expect(reads).toBe(2);
    expect(store.defer).toHaveBeenCalledWith(scheduledPost, 60);
    expect(integration.api.publishMemberTextPost).not.toHaveBeenCalled();
  });

  it('does not publish when the account is missing or the member post scope was revoked', async () => {
    const disconnected = makeWorker({ token: null });
    await disconnected.worker.runOnce();
    expect(disconnected.store.markFailed).toHaveBeenCalledWith(
      scheduledPost,
      'linkedin_connection_missing'
    );
    expect(disconnected.integration.api.publishMemberTextPost).not.toHaveBeenCalled();

    const revoked = makeWorker({
      token: { ...token, grantedScopes: ['openid', 'profile'] },
    });
    await revoked.worker.runOnce();
    expect(revoked.store.markFailed).toHaveBeenCalledWith(
      scheduledPost,
      'linkedin_member_post_scope_missing'
    );
    expect(revoked.integration.api.publishMemberTextPost).not.toHaveBeenCalled();
  });

  it('requires manual review instead of posting a schedule that missed its time by over one hour', async () => {
    const { worker, store, integration } = makeWorker();
    const overdue = {
      ...scheduledPost,
      scheduledAt: new Date(Date.now() - 61 * 60_000).toISOString(),
    };
    store.claimDue = vi.fn(async () => [overdue]);

    await worker.runOnce();

    expect(store.markNeedsReview).toHaveBeenCalledWith(
      overdue,
      'scheduled_time_missed_by_over_one_hour'
    );
    expect(integration.api.publishMemberTextPost).not.toHaveBeenCalled();
  });

  it('marks explicit non-rate-limit LinkedIn rejections as failed', async () => {
    const { worker, store, integration } = makeWorker({
      publish: async () => {
        throw new LinkedInApiError('Permission denied', 403);
      },
    });

    await worker.runOnce();

    expect(store.markFailed).toHaveBeenCalledWith(
      scheduledPost,
      'linkedin_api_rejected_request'
    );
    expect(store.markUnknownOutcome).not.toHaveBeenCalled();
    expect(store.defer).not.toHaveBeenCalled();
    expect(integration.api.publishMemberTextPost).toHaveBeenCalledOnce();
  });

  it('does not retry an explicit 429 after the bounded retry count is exhausted', async () => {
    const { worker, store } = makeWorker({
      publish: async () => {
        throw new LinkedInApiError('Rate limited', 429, 45);
      },
    });
    const exhausted = { ...scheduledPost, attemptCount: 3 };
    store.claimDue = vi.fn(async () => [exhausted]);

    await worker.runOnce();

    expect(store.markFailed).toHaveBeenCalledWith(
      exhausted,
      'linkedin_api_rejected_request'
    );
    expect(store.defer).not.toHaveBeenCalled();
  });

  it('rejects a mismatched tenant control record before publishing', async () => {
    const { worker, store, integration } = makeWorker({
      getControls: async () => ({
        tenantId: 'different-tenant',
        globalKillSwitch: false,
        pausedChannels: [],
        updatedAt: new Date().toISOString(),
      }),
    });

    await worker.runOnce();

    expect(store.defer).toHaveBeenCalledWith(scheduledPost, 60);
    expect(integration.api.publishMemberTextPost).not.toHaveBeenCalled();
  });

  it('marks a preflight failure for review after bounded attempts without calling LinkedIn', async () => {
    const { worker, store, integration } = makeWorker({
      getControls: async () => {
        throw new Error('database temporarily unavailable');
      },
    });
    const overdueAttempts = { ...scheduledPost, attemptCount: 5 };
    store.claimDue = vi.fn(async () => [overdueAttempts]);

    await worker.runOnce();

    expect(store.markNeedsReview).toHaveBeenCalledWith(
      overdueAttempts,
      'scheduler_preflight_failed_repeatedly'
    );
    expect(integration.api.publishMemberTextPost).not.toHaveBeenCalled();
  });
});
