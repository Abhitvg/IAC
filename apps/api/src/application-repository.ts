import {
  type ActivityFeedEvent,
  type ApplicationInput,
  type ApplicationRecord,
  type ApplicationStatus,
  type ApplicationTimelineEvent,
  assertValidTransition,
  computeDashboardMetrics,
  type DashboardMetrics,
  type TransitionRequest,
} from '../../../packages/cloud-core/src/tracker';
import { globalActivityHub } from './activity-hub';
import type { SqlPool } from './postgres-repository';

interface QueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount?: number | null;
}

interface SqlClient {
  query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<Row>>;
  release(): void;
}

async function withTenantClient<T>(
  pool: SqlPool,
  tenantId: string,
  work: (client: SqlClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    return await work(client);
  } finally {
    client.release();
  }
}

async function inTenantTransaction<T>(
  pool: SqlPool,
  tenantId: string,
  actorSubject: string,
  work: (client: SqlClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_subject', $1, true)", [actorSubject]);
    await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve original error
    }
    throw error;
  } finally {
    client.release();
  }
}

export interface ApplicationTrackerRepository {
  createApplication(
    tenantId: string,
    actorSubject: string,
    input: ApplicationInput
  ): Promise<ApplicationRecord>;
  getApplication(tenantId: string, id: string): Promise<ApplicationRecord | null>;
  listApplications(
    tenantId: string,
    options?: { status?: ApplicationStatus; limit?: number; offset?: number }
  ): Promise<ApplicationRecord[]>;
  transitionApplication(
    tenantId: string,
    actorSubject: string,
    id: string,
    request: TransitionRequest
  ): Promise<ApplicationRecord>;
  withdrawApplication(
    tenantId: string,
    actorSubject: string,
    id: string,
    reason: string
  ): Promise<ApplicationRecord>;
  getApplicationTimeline(tenantId: string, id: string): Promise<ApplicationTimelineEvent[]>;
  getDashboardMetrics(tenantId: string, dailyCap?: number): Promise<DashboardMetrics>;
  appendActivityEvent(
    tenantId: string,
    actorSubject: string,
    event: Omit<ActivityFeedEvent, 'id' | 'tenantId' | 'actorSubject' | 'createdAt'>
  ): Promise<ActivityFeedEvent>;
  listActivityEvents(tenantId: string, limit?: number): Promise<ActivityFeedEvent[]>;
}

export class PostgresApplicationTrackerRepository implements ApplicationTrackerRepository {
  constructor(private readonly pool: SqlPool) {}

  async createApplication(
    tenantId: string,
    actorSubject: string,
    input: ApplicationInput
  ): Promise<ApplicationRecord> {
    const occurredAt = new Date().toISOString();
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      // Check for duplicate application
      const existing = await client.query<{ id: string }>(
        `SELECT id FROM applications
          WHERE tenant_id = $1 AND company = $2 AND role = $3
            AND (($4::text IS NULL AND external_job_id IS NULL) OR external_job_id = $4::text)`,
        [tenantId, input.company, input.role, input.externalJobId ?? null]
      );

      if (existing.rows.length > 0) {
        throw new Error(
          `Duplicate application guard: already tracking ${input.company} - ${input.role}`
        );
      }

      const res = await client.query<{
        id: string;
        tenant_id: string;
        company: string;
        role: string;
        source_url: string | null;
        external_job_id: string | null;
        status: ApplicationStatus;
        channel: ApplicationRecord['channel'];
        score: number | null;
        submission_proof: ApplicationRecord['submissionProof'];
        metadata: Record<string, unknown>;
        created_by: string;
        created_at: Date | string;
        updated_at: Date | string;
      }>(
        `INSERT INTO applications (
          tenant_id, company, role, source_url, external_job_id, status,
          channel, score, metadata, created_by, created_at, updated_at
        ) VALUES ($1, $2, $3, $4, $5, 'scouted', $6, $7, $8, $9, $10, $10)
        RETURNING *`,
        [
          tenantId,
          input.company,
          input.role,
          input.sourceUrl ?? null,
          input.externalJobId ?? null,
          input.channel,
          input.score ?? null,
          JSON.stringify(input.metadata ?? {}),
          actorSubject,
          occurredAt,
        ]
      );

      const row = res.rows[0];
      const application: ApplicationRecord = {
        id: row.id,
        tenantId: row.tenant_id,
        company: row.company,
        role: row.role,
        sourceUrl: row.source_url ?? undefined,
        externalJobId: row.external_job_id ?? undefined,
        status: row.status,
        channel: row.channel,
        score: row.score !== null ? Number(row.score) : undefined,
        submissionProof: row.submission_proof ?? undefined,
        metadata: row.metadata,
        createdBy: row.created_by,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      };

      // Record timeline event
      await client.query(
        `INSERT INTO application_timeline_events (
          tenant_id, application_id, from_status, to_status, reason,
          actor_subject, metadata, created_at
        ) VALUES ($1, $2, NULL, 'scouted', 'Application scouted and tracked', $3, $4, $5)`,
        [tenantId, application.id, actorSubject, JSON.stringify({}), occurredAt]
      );

      // Record activity feed event
      const activityRes = await client.query<{ id: string }>(
        `INSERT INTO activity_feed_events (
          tenant_id, event_type, severity, title, description,
          actor_subject, metadata, created_at
        ) VALUES ($1, 'application.created', 'info', $2, $3, $4, $5, $6)
        RETURNING id`,
        [
          tenantId,
          `New application scouted: ${application.company}`,
          `Tracked ${application.role} at ${application.company} via ${application.channel}`,
          actorSubject,
          JSON.stringify({ applicationId: application.id }),
          occurredAt,
        ]
      );

      globalActivityHub.broadcast({
        id: activityRes.rows[0].id,
        tenantId,
        eventType: 'application.created',
        severity: 'info',
        title: `New application scouted: ${application.company}`,
        description: `Tracked ${application.role} at ${application.company} via ${application.channel}`,
        actorSubject,
        metadata: { applicationId: application.id },
        createdAt: occurredAt,
      });

      return application;
    });
  }

  async getApplication(tenantId: string, id: string): Promise<ApplicationRecord | null> {
    return withTenantClient(this.pool, tenantId, async (client) => {
      const res = await client.query<{
        id: string;
        tenant_id: string;
        company: string;
        role: string;
        source_url: string | null;
        external_job_id: string | null;
        status: ApplicationStatus;
        channel: ApplicationRecord['channel'];
        score: number | null;
        submission_proof: ApplicationRecord['submissionProof'];
        metadata: Record<string, unknown>;
        created_by: string;
        created_at: Date | string;
        updated_at: Date | string;
      }>(`SELECT * FROM applications WHERE tenant_id = $1 AND id = $2`, [tenantId, id]);

      if (res.rows.length === 0) return null;
      const row = res.rows[0];
      return {
        id: row.id,
        tenantId: row.tenant_id,
        company: row.company,
        role: row.role,
        sourceUrl: row.source_url ?? undefined,
        externalJobId: row.external_job_id ?? undefined,
        status: row.status,
        channel: row.channel,
        score: row.score !== null ? Number(row.score) : undefined,
        submissionProof: row.submission_proof ?? undefined,
        metadata: row.metadata,
        createdBy: row.created_by,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      };
    });
  }

  async listApplications(
    tenantId: string,
    options: { status?: ApplicationStatus; limit?: number; offset?: number } = {}
  ): Promise<ApplicationRecord[]> {
    const limit = Math.min(Math.max(options.limit ?? 50, 1), 100);
    const offset = Math.max(options.offset ?? 0, 0);

    const query = options.status
      ? `SELECT * FROM applications WHERE tenant_id = $1 AND status = $2 ORDER BY updated_at DESC LIMIT $3 OFFSET $4`
      : `SELECT * FROM applications WHERE tenant_id = $1 ORDER BY updated_at DESC LIMIT $2 OFFSET $3`;

    const params = options.status
      ? [tenantId, options.status, limit, offset]
      : [tenantId, limit, offset];

    return withTenantClient(this.pool, tenantId, async (client) => {
      const res = await client.query<any>(query, params);
      return res.rows.map((row: any) => ({
        id: row.id,
        tenantId: row.tenant_id,
        company: row.company,
        role: row.role,
        sourceUrl: row.source_url ?? undefined,
        externalJobId: row.external_job_id ?? undefined,
        status: row.status,
        channel: row.channel,
        score: row.score !== null ? Number(row.score) : undefined,
        submissionProof: row.submission_proof ?? undefined,
        metadata: row.metadata,
        createdBy: row.created_by,
        createdAt: new Date(row.created_at).toISOString(),
        updatedAt: new Date(row.updated_at).toISOString(),
      }));
    });
  }

  async transitionApplication(
    tenantId: string,
    actorSubject: string,
    id: string,
    request: TransitionRequest
  ): Promise<ApplicationRecord> {
    const occurredAt = new Date().toISOString();
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      const existingRes = await client.query<any>(
        `SELECT * FROM applications WHERE tenant_id = $1 AND id = $2 FOR UPDATE`,
        [tenantId, id]
      );

      if (existingRes.rows.length === 0) {
        throw new Error('Application not found');
      }

      const existing = existingRes.rows[0];
      assertValidTransition(existing.status, request);

      const updateRes = await client.query<any>(
        `UPDATE applications
            SET status = $1,
                submission_proof = COALESCE($2::jsonb, submission_proof),
                metadata = metadata || $3::jsonb,
                updated_at = $4
          WHERE tenant_id = $5 AND id = $6
        RETURNING *`,
        [
          request.toStatus,
          request.submissionProof ? JSON.stringify(request.submissionProof) : null,
          JSON.stringify(request.metadata ?? {}),
          occurredAt,
          tenantId,
          id,
        ]
      );

      const updated = updateRes.rows[0];

      // Timeline event
      await client.query(
        `INSERT INTO application_timeline_events (
          tenant_id, application_id, from_status, to_status, reason,
          actor_subject, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [
          tenantId,
          id,
          existing.status,
          request.toStatus,
          request.reason ?? null,
          actorSubject,
          JSON.stringify(request.metadata ?? {}),
          occurredAt,
        ]
      );

      // Activity event
      const activityRes = await client.query<{ id: string }>(
        `INSERT INTO activity_feed_events (
          tenant_id, event_type, severity, title, description,
          actor_subject, metadata, created_at
        ) VALUES ($1, 'application.status_changed', 'info', $2, $3, $4, $5, $6)
        RETURNING id`,
        [
          tenantId,
          `${updated.company} status: ${request.toStatus}`,
          `${updated.role} at ${updated.company} moved from ${existing.status} to ${request.toStatus}${
            request.reason ? ` (${request.reason})` : ''
          }`,
          actorSubject,
          JSON.stringify({ applicationId: id, from: existing.status, to: request.toStatus }),
          occurredAt,
        ]
      );

      globalActivityHub.broadcast({
        id: activityRes.rows[0].id,
        tenantId,
        eventType: 'application.status_changed',
        severity:
          request.toStatus === 'offer'
            ? 'success'
            : request.toStatus === 'rejected'
              ? 'warn'
              : 'info',
        title: `${updated.company} status: ${request.toStatus}`,
        description: `${updated.role} at ${updated.company} moved to ${request.toStatus}`,
        actorSubject,
        metadata: { applicationId: id, from: existing.status, to: request.toStatus },
        createdAt: occurredAt,
      });

      return {
        id: updated.id,
        tenantId: updated.tenant_id,
        company: updated.company,
        role: updated.role,
        sourceUrl: updated.source_url ?? undefined,
        externalJobId: updated.external_job_id ?? undefined,
        status: updated.status,
        channel: updated.channel,
        score: updated.score !== null ? Number(updated.score) : undefined,
        submissionProof: updated.submission_proof ?? undefined,
        metadata: updated.metadata,
        createdBy: updated.created_by,
        createdAt: new Date(updated.created_at).toISOString(),
        updatedAt: new Date(updated.updated_at).toISOString(),
      };
    });
  }

  async withdrawApplication(
    tenantId: string,
    actorSubject: string,
    id: string,
    reason: string
  ): Promise<ApplicationRecord> {
    return this.transitionApplication(tenantId, actorSubject, id, {
      toStatus: 'withdrawn',
      reason,
    });
  }

  async getApplicationTimeline(tenantId: string, id: string): Promise<ApplicationTimelineEvent[]> {
    return withTenantClient(this.pool, tenantId, async (client) => {
      const res = await client.query<any>(
        `SELECT * FROM application_timeline_events
          WHERE tenant_id = $1 AND application_id = $2
          ORDER BY created_at ASC`,
        [tenantId, id]
      );

      return res.rows.map((row: any) => ({
        id: row.id,
        tenantId: row.tenant_id,
        applicationId: row.application_id,
        fromStatus: row.from_status,
        toStatus: row.to_status,
        reason: row.reason ?? undefined,
        actorSubject: row.actor_subject,
        metadata: row.metadata,
        createdAt: new Date(row.created_at).toISOString(),
      }));
    });
  }

  async getDashboardMetrics(tenantId: string, dailyCap = 25): Promise<DashboardMetrics> {
    const apps = await this.listApplications(tenantId, { limit: 100 });
    return computeDashboardMetrics(apps, dailyCap);
  }

  async appendActivityEvent(
    tenantId: string,
    actorSubject: string,
    event: Omit<ActivityFeedEvent, 'id' | 'tenantId' | 'actorSubject' | 'createdAt'>
  ): Promise<ActivityFeedEvent> {
    const occurredAt = new Date().toISOString();
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      const res = await client.query<{ id: string }>(
        `INSERT INTO activity_feed_events (
          tenant_id, event_type, severity, title, description,
          actor_subject, metadata, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        RETURNING id`,
        [
          tenantId,
          event.eventType,
          event.severity,
          event.title,
          event.description,
          actorSubject,
          JSON.stringify(event.metadata ?? {}),
          occurredAt,
        ]
      );

      const record: ActivityFeedEvent = {
        id: res.rows[0].id,
        tenantId,
        eventType: event.eventType,
        severity: event.severity,
        title: event.title,
        description: event.description,
        actorSubject,
        metadata: event.metadata,
        createdAt: occurredAt,
      };

      globalActivityHub.broadcast(record);
      return record;
    });
  }

  async listActivityEvents(tenantId: string, limit = 50): Promise<ActivityFeedEvent[]> {
    const safeLimit = Math.min(Math.max(limit, 1), 100);
    return withTenantClient(this.pool, tenantId, async (client) => {
      const res = await client.query<any>(
        `SELECT * FROM activity_feed_events
          WHERE tenant_id = $1
          ORDER BY created_at DESC
          LIMIT $2`,
        [tenantId, safeLimit]
      );

      return res.rows.map((row: any) => ({
        id: row.id,
        tenantId: row.tenant_id,
        eventType: row.event_type,
        severity: row.severity,
        title: row.title,
        description: row.description,
        actorSubject: row.actor_subject,
        metadata: row.metadata,
        createdAt: new Date(row.created_at).toISOString(),
      }));
    });
  }
}
