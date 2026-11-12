import type { SqlPool } from './postgres-repository';
import type {
  AllocationArm,
  AutoPauseEvent,
  SprintMetrics,
  SprintRun,
  SprintStatus,
} from '../../../packages/cloud-core/src/sprint/types';

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
      // Preserve error
    }
    throw error;
  } finally {
    client.release();
  }
}

export interface SprintRepository {
  createSprint(
    tenantId: string,
    sprint: SprintRun,
    arms: AllocationArm[],
    actorSubject: string
  ): Promise<SprintRun>;
  getSprint(tenantId: string, sprintId: string): Promise<{ sprint: SprintRun; arms: AllocationArm[] } | null>;
  getActiveSprint(tenantId: string): Promise<{ sprint: SprintRun; arms: AllocationArm[] } | null>;
  updateSprintMetrics(
    tenantId: string,
    sprintId: string,
    metrics: Partial<SprintMetrics>,
    actorSubject: string
  ): Promise<SprintRun>;
  updateSprintStatus(
    tenantId: string,
    sprintId: string,
    status: SprintStatus,
    actorSubject: string
  ): Promise<SprintRun>;
  saveAllocations(tenantId: string, sprintId: string, arms: AllocationArm[], actorSubject: string): Promise<void>;
  recordAutoPauseEvent(tenantId: string, event: AutoPauseEvent, actorSubject: string): Promise<void>;
  getAutoPauseEvents(tenantId: string, sprintId: string): Promise<AutoPauseEvent[]>;
}

export class SqlSprintRepository implements SprintRepository {
  private readonly pool: SqlPool;

  constructor(pool: SqlPool) {
    this.pool = pool;
  }

  public async createSprint(
    tenantId: string,
    sprint: SprintRun,
    arms: AllocationArm[],
    actorSubject: string
  ): Promise<SprintRun> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      const sprintRes = await client.query<Record<string, unknown>>(
        `
        INSERT INTO sprint_runs (
          id, tenant_id, contract_id, status, target_duration_hours, started_at,
          config, metrics, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10)
        RETURNING *
      `,
        [
          sprint.id,
          tenantId,
          sprint.contractId || null,
          sprint.status,
          sprint.targetDurationHours,
          sprint.startedAt,
          JSON.stringify(sprint.config),
          JSON.stringify(sprint.metrics),
          sprint.createdAt,
          sprint.updatedAt,
        ]
      );

      for (const arm of arms) {
        await client.query(
          `
          INSERT INTO sprint_allocations (
            tenant_id, sprint_id, channel, target_role, template_id,
            weight, pulls, successes, status, updated_at
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
        `,
          [
            tenantId,
            sprint.id,
            arm.channel,
            arm.targetRole,
            arm.templateId,
            arm.weight,
            arm.pulls,
            arm.successes,
            arm.status,
          ]
        );
      }

      return this.mapSprintRow(sprintRes.rows[0]);
    });
  }

  public async getSprint(tenantId: string, sprintId: string): Promise<{ sprint: SprintRun; arms: AllocationArm[] } | null> {
    return withTenantClient(this.pool, tenantId, async (client) => {
      const sprintRes = await client.query<Record<string, unknown>>(
        'SELECT * FROM sprint_runs WHERE id = $1 AND tenant_id = $2',
        [sprintId, tenantId]
      );
      if (sprintRes.rows.length === 0) return null;

      const armsRes = await client.query<Record<string, unknown>>(
        'SELECT * FROM sprint_allocations WHERE sprint_id = $1 AND tenant_id = $2 ORDER BY weight DESC',
        [sprintId, tenantId]
      );

      return {
        sprint: this.mapSprintRow(sprintRes.rows[0]),
        arms: armsRes.rows.map(this.mapArmRow),
      };
    });
  }

  public async getActiveSprint(tenantId: string): Promise<{ sprint: SprintRun; arms: AllocationArm[] } | null> {
    return withTenantClient(this.pool, tenantId, async (client) => {
      const sprintRes = await client.query<Record<string, unknown>>(
        "SELECT * FROM sprint_runs WHERE tenant_id = $1 AND status IN ('active', 'paused') ORDER BY created_at DESC LIMIT 1",
        [tenantId]
      );
      if (sprintRes.rows.length === 0) return null;

      const sprint = this.mapSprintRow(sprintRes.rows[0]);
      const armsRes = await client.query<Record<string, unknown>>(
        'SELECT * FROM sprint_allocations WHERE sprint_id = $1 AND tenant_id = $2 ORDER BY weight DESC',
        [sprint.id, tenantId]
      );

      return {
        sprint,
        arms: armsRes.rows.map(this.mapArmRow),
      };
    });
  }

  public async updateSprintMetrics(
    tenantId: string,
    sprintId: string,
    metrics: Partial<SprintMetrics>,
    actorSubject: string
  ): Promise<SprintRun> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      const current = await client.query<Record<string, unknown>>(
        'SELECT metrics FROM sprint_runs WHERE id = $1 AND tenant_id = $2 FOR UPDATE',
        [sprintId, tenantId]
      );
      if (current.rows.length === 0) throw new Error(`Sprint not found: ${sprintId}`);

      const merged = {
        ...(typeof current.rows[0].metrics === 'string'
          ? JSON.parse(current.rows[0].metrics)
          : (current.rows[0].metrics as Record<string, unknown>) || {}),
        ...metrics,
      };

      const res = await client.query<Record<string, unknown>>(
        `
        UPDATE sprint_runs
        SET metrics = $1::jsonb, updated_at = now()
        WHERE id = $2 AND tenant_id = $3
        RETURNING *
      `,
        [JSON.stringify(merged), sprintId, tenantId]
      );

      return this.mapSprintRow(res.rows[0]);
    });
  }

  public async updateSprintStatus(
    tenantId: string,
    sprintId: string,
    status: SprintStatus,
    actorSubject: string
  ): Promise<SprintRun> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      const res = await client.query<Record<string, unknown>>(
        `
        UPDATE sprint_runs
        SET status = $1,
            ended_at = CASE WHEN $1 IN ('completed', 'aborted') THEN now() ELSE ended_at END,
            updated_at = now()
        WHERE id = $2 AND tenant_id = $3
        RETURNING *
      `,
        [status, sprintId, tenantId]
      );
      if (res.rows.length === 0) throw new Error(`Sprint not found: ${sprintId}`);
      return this.mapSprintRow(res.rows[0]);
    });
  }

  public async saveAllocations(
    tenantId: string,
    sprintId: string,
    arms: AllocationArm[],
    actorSubject: string
  ): Promise<void> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      for (const arm of arms) {
        if (arm.id) {
          await client.query(
            `
            UPDATE sprint_allocations
            SET weight = $1, pulls = $2, successes = $3, status = $4, updated_at = now()
            WHERE id = $5 AND tenant_id = $6
          `,
            [arm.weight, arm.pulls, arm.successes, arm.status, arm.id, tenantId]
          );
        } else {
          await client.query(
            `
            INSERT INTO sprint_allocations (
              tenant_id, sprint_id, channel, target_role, template_id,
              weight, pulls, successes, status, updated_at
            )
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
          `,
            [
              tenantId,
              sprintId,
              arm.channel,
              arm.targetRole,
              arm.templateId,
              arm.weight,
              arm.pulls,
              arm.successes,
              arm.status,
            ]
          );
        }
      }
    });
  }

  public async recordAutoPauseEvent(
    tenantId: string,
    event: AutoPauseEvent,
    actorSubject: string
  ): Promise<void> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      await client.query(
        `
        INSERT INTO sprint_auto_pause_events (
          tenant_id, sprint_id, channel, trigger_type, metric_value, threshold, details, created_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      `,
        [
          tenantId,
          event.sprintId,
          event.channel,
          event.triggerType,
          event.metricValue,
          event.threshold,
          event.details,
          event.createdAt,
        ]
      );
    });
  }

  public async getAutoPauseEvents(tenantId: string, sprintId: string): Promise<AutoPauseEvent[]> {
    return withTenantClient(this.pool, tenantId, async (client) => {
      const res = await client.query<Record<string, unknown>>(
        'SELECT * FROM sprint_auto_pause_events WHERE sprint_id = $1 AND tenant_id = $2 ORDER BY created_at DESC',
        [sprintId, tenantId]
      );
      return res.rows.map((row) => ({
        id: String(row.id),
        sprintId: String(row.sprint_id),
        channel: row.channel as any,
        triggerType: row.trigger_type as any,
        metricValue: Number(row.metric_value),
        threshold: Number(row.threshold),
        details: String(row.details),
        createdAt: new Date(String(row.created_at)).toISOString(),
        resolvedAt: row.resolved_at ? new Date(String(row.resolved_at)).toISOString() : undefined,
      }));
    });
  }

  private mapSprintRow(row: Record<string, unknown>): SprintRun {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      contractId: row.contract_id ? String(row.contract_id) : undefined,
      status: row.status as SprintStatus,
      targetDurationHours: Number(row.target_duration_hours),
      startedAt: new Date(String(row.started_at)).toISOString(),
      endedAt: row.ended_at ? new Date(String(row.ended_at)).toISOString() : undefined,
      config: typeof row.config === 'string' ? JSON.parse(row.config) : (row.config as any) || {},
      metrics: typeof row.metrics === 'string' ? JSON.parse(row.metrics) : (row.metrics as any) || {},
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    };
  }

  private mapArmRow(row: Record<string, unknown>): AllocationArm {
    return {
      id: String(row.id),
      channel: row.channel as any,
      targetRole: String(row.target_role),
      templateId: String(row.template_id),
      weight: Number(row.weight),
      pulls: Number(row.pulls),
      successes: Number(row.successes),
      status: row.status as any,
    };
  }
}

