import { randomUUID } from 'node:crypto';
import type { CloudApiRepository, LinkedInCloudIntegration } from '../ports';
import { LinkedInApiError } from './client';

export type ScheduledPostStatus =
  | 'scheduled'
  | 'processing'
  | 'published'
  | 'failed'
  | 'cancelled'
  | 'unknown_outcome'
  | 'needs_review';

export interface ScheduledLinkedInPost {
  id: string;
  tenantId: string;
  subject: string;
  commentary: string;
  scheduledAt: string;
  nextAttemptAt: string;
  status: ScheduledPostStatus;
  attemptCount: number;
  publishedPostUrn: string | null;
  errorCode: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ScheduleLinkedInPostInput {
  tenantId: string;
  subject: string;
  commentary: string;
  scheduledAt: string;
  idempotencyKey: string;
}

interface SqlResult<Row> {
  rows: Row[];
  rowCount?: number | null;
}

interface SqlClient {
  query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<SqlResult<Row>>;
  release(): void;
}

export interface LinkedInScheduleSqlPool {
  connect(): Promise<SqlClient>;
}

interface ScheduledPostRow {
  id: string;
  tenant_id: string;
  subject: string;
  commentary: string;
  scheduled_at: Date | string;
  next_attempt_at: Date | string;
  status: ScheduledPostStatus;
  attempt_count: number;
  published_post_urn: string | null;
  error_code: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

function toIso(value: Date | string): string {
  return new Date(value).toISOString();
}

function mapRow(row: ScheduledPostRow): ScheduledLinkedInPost {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    subject: row.subject,
    commentary: row.commentary,
    scheduledAt: toIso(row.scheduled_at),
    nextAttemptAt: toIso(row.next_attempt_at),
    status: row.status,
    attemptCount: row.attempt_count,
    publishedPostUrn: row.published_post_urn,
    errorCode: row.error_code,
    createdAt: toIso(row.created_at),
    updatedAt: toIso(row.updated_at),
  };
}

async function inTenant<T>(
  pool: LinkedInScheduleSqlPool,
  tenantId: string,
  subject: string,
  work: (client: SqlClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_subject', $1, true)", [subject]);
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original failure.
    }
    throw error;
  } finally {
    client.release();
  }
}

export class LinkedInScheduledPostStore {
  constructor(private readonly pool: LinkedInScheduleSqlPool) {}

  async create(input: ScheduleLinkedInPostInput): Promise<ScheduledLinkedInPost> {
    if (
      !input.tenantId ||
      !input.subject ||
      !input.commentary.trim() ||
      input.commentary.length > 3000 ||
      !/^[A-Za-z0-9_-]{12,64}$/.test(input.idempotencyKey)
    ) {
      throw new Error('Invalid scheduled LinkedIn post');
    }
    const scheduledAt = new Date(input.scheduledAt);
    if (!Number.isFinite(scheduledAt.getTime())) {
      throw new Error('Scheduled publication time is invalid');
    }

    return inTenant(this.pool, input.tenantId, input.subject, async (client) => {
      const id = randomUUID();
      const inserted = await client.query<ScheduledPostRow>(
        `INSERT INTO linkedin_scheduled_posts
           (id, tenant_id, subject, idempotency_key, commentary, scheduled_at, next_attempt_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         ON CONFLICT (tenant_id, subject, idempotency_key) DO NOTHING
         RETURNING id, tenant_id, subject, commentary, scheduled_at, next_attempt_at,
                   status, attempt_count, published_post_urn, error_code, created_at, updated_at`,
        [
          id,
          input.tenantId,
          input.subject,
          input.idempotencyKey,
          input.commentary.trim(),
          scheduledAt.toISOString(),
        ]
      );
      if (inserted.rows[0]) return mapRow(inserted.rows[0]);

      const existing = await client.query<ScheduledPostRow>(
        `SELECT id, tenant_id, subject, commentary, scheduled_at, next_attempt_at,
                status, attempt_count, published_post_urn, error_code, created_at, updated_at
           FROM linkedin_scheduled_posts
          WHERE tenant_id = $1 AND subject = $2 AND idempotency_key = $3`,
        [input.tenantId, input.subject, input.idempotencyKey]
      );
      const row = existing.rows[0];
      if (
        !row ||
        row.commentary !== input.commentary.trim() ||
        new Date(row.scheduled_at).getTime() !== scheduledAt.getTime()
      ) {
        throw new Error('Idempotency key already belongs to a different scheduled post');
      }
      return mapRow(row);
    });
  }

  async list(tenantId: string, subject: string, limit = 50): Promise<ScheduledLinkedInPost[]> {
    return inTenant(this.pool, tenantId, subject, async (client) => {
      const result = await client.query<ScheduledPostRow>(
        `SELECT id, tenant_id, subject, commentary, scheduled_at, next_attempt_at,
                status, attempt_count, published_post_urn, error_code, created_at, updated_at
           FROM linkedin_scheduled_posts
          WHERE tenant_id = $1 AND subject = $2
          ORDER BY scheduled_at DESC
          LIMIT $3`,
        [tenantId, subject, limit]
      );
      return result.rows.map(mapRow);
    });
  }

  async cancel(tenantId: string, subject: string, id: string): Promise<boolean> {
    return inTenant(this.pool, tenantId, subject, async (client) => {
      const result = await client.query<{ cancelled: boolean }>(
        'SELECT cancel_linkedin_scheduled_post($1, $2, $3) AS cancelled',
        [id, tenantId, subject]
      );
      return result.rows[0]?.cancelled === true;
    });
  }

  async claimDue(limit = 10): Promise<ScheduledLinkedInPost[]> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<ScheduledPostRow>(
        'SELECT * FROM claim_linkedin_scheduled_posts_due($1)',
        [limit]
      );
      return result.rows.map(mapRow);
    } finally {
      client.release();
    }
  }

  async defer(id: string, delaySeconds = 30): Promise<void> {
    const boundedDelay = Math.max(10, Math.min(delaySeconds, 3600));
    const nextAttemptAt = new Date(Date.now() + boundedDelay * 1000).toISOString();
    await this.updateClaimed(id, 'scheduled', { nextAttemptAt });
  }

  async markPublished(id: string, postUrn: string): Promise<void> {
    await this.updateClaimed(id, 'published', { publishedPostUrn: postUrn });
  }

  async markFailed(id: string, errorCode: string): Promise<void> {
    await this.updateClaimed(id, 'failed', { errorCode });
  }

  async markUnknownOutcome(id: string, errorCode: string): Promise<void> {
    await this.updateClaimed(id, 'unknown_outcome', { errorCode });
  }

  async markNeedsReview(id: string, errorCode: string): Promise<void> {
    await this.updateClaimed(id, 'needs_review', { errorCode });
  }

  private async updateClaimed(
    id: string,
    status: 'scheduled' | 'published' | 'failed' | 'unknown_outcome' | 'needs_review',
    values: {
      publishedPostUrn?: string;
      errorCode?: string;
      nextAttemptAt?: string;
    } = {}
  ): Promise<void> {
    const client = await this.pool.connect();
    try {
      const result = await client.query<{ changed: boolean }>(
        `SELECT transition_linkedin_scheduled_post($1, $2, $3, $4, $5) AS changed`,
        [
          id,
          status,
          values.publishedPostUrn ?? null,
          values.errorCode ?? null,
          values.nextAttemptAt ?? null,
        ]
      );
      if (result.rows[0]?.changed !== true) {
        throw new Error('Scheduled LinkedIn post is no longer owned by this worker');
      }
    } finally {
      client.release();
    }
  }
}

export class LinkedInScheduledPostWorker {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;

  constructor(
    private readonly store: LinkedInScheduledPostStore,
    private readonly integration: LinkedInCloudIntegration,
    private readonly repository: CloudApiRepository,
    private readonly intervalMs = 15_000,
    private readonly batchSize = 10
  ) {
    if (!Number.isInteger(intervalMs) || intervalMs < 5_000 || intervalMs > 60_000) {
      throw new Error('LinkedIn scheduler interval must be between 5 and 60 seconds');
    }
    if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 50) {
      throw new Error('LinkedIn scheduler batch size must be between 1 and 50');
    }
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.runOnce(), this.intervalMs);
    this.timer.unref?.();
    void this.runOnce();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async runOnce(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const duePosts = await this.store.claimDue(this.batchSize);
      for (const post of duePosts) {
        await this.process(post);
      }
    } catch {
      // Intentionally avoid logging database values, OAuth material or user post text.
      console.error('LinkedIn scheduled-post worker tick failed.');
    } finally {
      this.running = false;
    }
  }

  private async process(post: ScheduledLinkedInPost): Promise<void> {
    const identity = { tenantId: post.tenantId, subject: post.subject };
    try {
      const controls = await this.repository.getControlState(post.tenantId);
      if (
        controls.tenantId !== post.tenantId ||
        controls.globalKillSwitch ||
        controls.pausedChannels.includes('linkedin_assist')
      ) {
        await this.store.defer(post.id, 60);
        return;
      }

      if (Date.now() - new Date(post.scheduledAt).getTime() > 60 * 60_000) {
        await this.store.markNeedsReview(post.id, 'scheduled_time_missed_by_over_one_hour');
        return;
      }

      const tokenSet = await this.integration.oauth.getValidToken(identity);
      if (!tokenSet) {
        await this.store.markFailed(post.id, 'linkedin_connection_missing');
        return;
      }
      if (!tokenSet.grantedScopes.includes('w_member_social')) {
        await this.store.markFailed(post.id, 'linkedin_member_post_scope_missing');
        return;
      }
      if (!this.repository.recordLinkedInAction) {
        await this.store.markFailed(post.id, 'linkedin_audit_unavailable');
        return;
      }

      await this.repository.recordLinkedInAction({
        tenantId: post.tenantId,
        actorSubject: post.subject,
        action: 'linkedin.member.post.scheduled_publish.requested',
        entityId: post.id,
        occurredAt: new Date().toISOString(),
        metadata: {
          scheduledAt: post.scheduledAt,
          attempt: post.attemptCount,
          contentLength: post.commentary.length,
        },
      });

      const result = await this.integration.api.publishMemberTextPost(
        tokenSet,
        `urn:li:person:${tokenSet.memberId}`,
        post.commentary
      );
      await this.store.markPublished(post.id, result.id);
    } catch (error) {
      if (error instanceof LinkedInApiError && error.status === 429 && post.attemptCount < 3) {
        await this.store.defer(post.id, error.retryAfterSeconds ?? 60);
        return;
      }
      if (error instanceof LinkedInApiError && error.status < 500) {
        await this.store.markFailed(post.id, 'linkedin_api_rejected_request');
        return;
      }
      // A network or server error may happen after LinkedIn accepted the post.
      // Mark unknown instead of blindly retrying and creating a duplicate post.
      try {
        await this.store.markUnknownOutcome(post.id, 'linkedin_publish_outcome_unknown');
      } catch {
        // An expired processing lease will be moved to unknown_outcome on the next claim.
      }
    }
  }
}
