import type {
  AssistQueueItem,
  AssistQueueStatus,
} from '../../../packages/cloud-core/src/apply/assist-queue';
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

export interface AssistQueueRepository {
  enqueue(tenantId: string, item: AssistQueueItem, actorSubject: string): Promise<AssistQueueItem>;
  list(tenantId: string, status?: AssistQueueStatus): Promise<AssistQueueItem[]>;
  getById(tenantId: string, id: string): Promise<AssistQueueItem | null>;
  markOpened(tenantId: string, id: string, actorSubject: string): Promise<AssistQueueItem>;
  complete(tenantId: string, id: string, assistNotes?: string, actorSubject?: string): Promise<AssistQueueItem>;
  dismiss(tenantId: string, id: string, actorSubject?: string): Promise<AssistQueueItem>;
}

export class SqlAssistQueueRepository implements AssistQueueRepository {
  private readonly pool: SqlPool;

  constructor(pool: SqlPool) {
    this.pool = pool;
  }

  private mapRow(row: Record<string, unknown>): AssistQueueItem {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      applicationId: row.application_id ? String(row.application_id) : null,
      company: String(row.company),
      role: String(row.role),
      platform: row.platform as any,
      targetUrl: String(row.target_url),
      handOffReason: row.hand_off_reason as any,
      status: row.status as any,
      prefilledPayload: (row.prefilled_payload as Record<string, unknown>) ?? {},
      assistNotes: row.assist_notes ? String(row.assist_notes) : undefined,
      userGestureRequired: Boolean(row.user_gesture_required),
      openedAt: row.opened_at ? new Date(row.opened_at as string).toISOString() : undefined,
      completedAt: row.completed_at ? new Date(row.completed_at as string).toISOString() : undefined,
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }

  public async enqueue(
    tenantId: string,
    item: AssistQueueItem,
    actorSubject: string
  ): Promise<AssistQueueItem> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      const res = await client.query(
        `
        INSERT INTO assist_queue_items (
          id, tenant_id, application_id, company, role, platform, target_url,
          hand_off_reason, status, prefilled_payload, assist_notes, user_gesture_required,
          created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb, $11, $12, $13, $14)
        RETURNING *
      `,
        [
          item.id,
          tenantId,
          item.applicationId ?? null,
          item.company,
          item.role,
          item.platform,
          item.targetUrl,
          item.handOffReason,
          item.status,
          JSON.stringify(item.prefilledPayload),
          item.assistNotes ?? null,
          item.userGestureRequired,
          item.createdAt,
          item.updatedAt,
        ]
      );
      return this.mapRow(res.rows[0]);
    });
  }

  public async list(tenantId: string, status?: AssistQueueStatus): Promise<AssistQueueItem[]> {
    return withTenantClient(this.pool, tenantId, async (client) => {
      const sql = status
        ? `SELECT * FROM assist_queue_items WHERE tenant_id = $1 AND status = $2 ORDER BY created_at DESC`
        : `SELECT * FROM assist_queue_items WHERE tenant_id = $1 ORDER BY created_at DESC`;
      const params = status ? [tenantId, status] : [tenantId];
      const res = await client.query(sql, params);
      return res.rows.map((r) => this.mapRow(r));
    });
  }

  public async getById(tenantId: string, id: string): Promise<AssistQueueItem | null> {
    return withTenantClient(this.pool, tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM assist_queue_items WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id]
      );
      if (res.rows.length === 0) return null;
      return this.mapRow(res.rows[0]);
    });
  }

  public async markOpened(
    tenantId: string,
    id: string,
    actorSubject: string
  ): Promise<AssistQueueItem> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      const now = new Date().toISOString();
      const res = await client.query(
        `
        UPDATE assist_queue_items
        SET status = 'opened', opened_at = COALESCE(opened_at, $3), updated_at = $3
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
      `,
        [tenantId, id, now]
      );
      if (res.rows.length === 0) {
        throw new Error(`Assist queue item not found: ${id}`);
      }
      return this.mapRow(res.rows[0]);
    });
  }

  public async complete(
    tenantId: string,
    id: string,
    assistNotes?: string,
    actorSubject: string = 'user'
  ): Promise<AssistQueueItem> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      const now = new Date().toISOString();
      const res = await client.query(
        `
        UPDATE assist_queue_items
        SET status = 'completed', completed_at = $3, updated_at = $3,
            assist_notes = COALESCE($4, assist_notes)
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
      `,
        [tenantId, id, now, assistNotes ?? null]
      );
      if (res.rows.length === 0) {
        throw new Error(`Assist queue item not found: ${id}`);
      }
      return this.mapRow(res.rows[0]);
    });
  }

  public async dismiss(
    tenantId: string,
    id: string,
    actorSubject: string = 'user'
  ): Promise<AssistQueueItem> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      const now = new Date().toISOString();
      const res = await client.query(
        `
        UPDATE assist_queue_items
        SET status = 'dismissed', updated_at = $3
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
      `,
        [tenantId, id, now]
      );
      if (res.rows.length === 0) {
        throw new Error(`Assist queue item not found: ${id}`);
      }
      return this.mapRow(res.rows[0]);
    });
  }
}
