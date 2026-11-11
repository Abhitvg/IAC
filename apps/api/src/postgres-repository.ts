import { appendAuditEvent, type AuditRecord } from '../../../packages/cloud-core/src/audit';
import type { CloudApiRepository } from './ports';
import type { TenantMembership, TenantMembershipRepository } from '../../../packages/cloud-core/src/tenant';

interface QueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount?: number | null;
}

interface SqlClient {
  query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<Row>>;
  release(): void;
}

export interface SqlPool {
  connect(): Promise<SqlClient>;
}

interface MembershipRow {
  tenant_id: string;
  subject: string;
  role: 'owner' | 'member';
  status: 'active' | 'suspended';
}

interface ControlRow {
  tenant_id: string;
  global_kill_switch: boolean;
  paused_channels: string[];
  updated_at: Date | string;
}

async function inTransaction<T>(
  pool: SqlPool,
  subject: string,
  tenantId: string | null,
  work: (client: SqlClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query("SELECT set_config('app.user_subject', $1, true)", [subject]);
    if (tenantId) {
      await client.query("SELECT set_config('app.tenant_id', $1, true)", [tenantId]);
    }
    const result = await work(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      // Preserve the original transaction error.
    }
    throw error;
  } finally {
    client.release();
  }
}

export class PostgresCloudApiRepository implements CloudApiRepository, TenantMembershipRepository {
  constructor(private readonly pool: SqlPool) {}

  async findMembershipsBySubject(subject: string): Promise<TenantMembership[]> {
    return inTransaction(this.pool, subject, null, async (client) => {
      const result = await client.query<MembershipRow>(
        `SELECT tenant_id, subject, role, status
           FROM tenant_memberships
          WHERE subject = $1 AND status = 'active'`,
        [subject]
      );
      return result.rows.map((row) => ({
        tenantId: row.tenant_id,
        subject: row.subject,
        role: row.role,
        status: row.status,
      }));
    });
  }

  async getControlState(tenantId: string) {
    // RLS context is set in a transaction and never carried over a pooled connection.
    return inTransaction(this.pool, 'system:api', tenantId, async (client) => {
      const result = await client.query<ControlRow>(
        `SELECT tenant_id, global_kill_switch, paused_channels, updated_at
           FROM tenant_controls
          WHERE tenant_id = $1`,
        [tenantId]
      );
      const row = result.rows[0];
      if (!row) throw new Error('Tenant control state not found');
      return {
        tenantId: row.tenant_id,
        globalKillSwitch: row.global_kill_switch,
        pausedChannels: row.paused_channels as ('ats' | 'email' | 'calendar' | 'linkedin_assist')[],
        updatedAt: new Date(row.updated_at).toISOString(),
      };
    });
  }

  async setGlobalKillSwitchWithAudit(input: {
    tenantId: string;
    actorSubject: string;
    enabled: boolean;
    occurredAt: string;
    metadata: Record<string, string | boolean>;
  }): Promise<void> {
    await inTransaction(this.pool, input.actorSubject, input.tenantId, async (client) => {
      // Serialize writes per tenant so concurrent audit appends cannot fork the hash chain.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [input.tenantId]);
      const updated = await client.query(
        `UPDATE tenant_controls
            SET global_kill_switch = $2, updated_at = $3
          WHERE tenant_id = $1`,
        [input.tenantId, input.enabled, input.occurredAt]
      );
      if (updated.rowCount !== 1) throw new Error('Tenant control state not found');

      const previous = await client.query<{ event_hash: string }>(
        `SELECT event_hash
           FROM audit_events
          WHERE tenant_id = $1
          ORDER BY sequence_id DESC
          LIMIT 1`,
        [input.tenantId]
      );
      const auditInput = {
        tenantId: input.tenantId,
        actorSubject: input.actorSubject,
        action: input.enabled ? 'kill_switch.enabled' : 'kill_switch.disabled',
        entityType: 'tenant_control',
        entityId: input.tenantId,
        occurredAt: input.occurredAt,
        metadata: input.metadata,
      };
      await appendAuditEvent({
        append: async (record: AuditRecord) => {
          await client.query(
            `INSERT INTO audit_events
              (tenant_id, actor_subject, action, entity_type, entity_id, occurred_at,
               metadata, previous_hash, event_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
            [
              record.tenantId,
              record.actorSubject,
              record.action,
              record.entityType,
              record.entityId,
              record.occurredAt,
              JSON.stringify(record.metadata ?? {}),
              record.previousHash,
              record.eventHash,
            ]
          );
        },
      }, auditInput, previous.rows[0]?.event_hash ?? null);
    });
  }
}
