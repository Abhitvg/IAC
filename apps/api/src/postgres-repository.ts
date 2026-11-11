import { appendAuditEvent, type AuditRecord } from '../../../packages/cloud-core/src/audit';
import type { CloudApiRepository } from './ports';
import type { ConsentRecord } from '../../../packages/cloud-core/src/contract';
import type {
  TenantMembership,
  TenantMembershipRepository,
} from '../../../packages/cloud-core/src/tenant';

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

export interface ClosableSqlPool extends SqlPool {
  end(): Promise<void>;
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

  async checkReady(): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query('SELECT 1');
    } finally {
      client.release();
    }
  }

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

  async setChannelPauseWithAudit(input: {
    tenantId: string;
    actorSubject: string;
    channel: 'ats' | 'email' | 'calendar' | 'linkedin_assist';
    paused: boolean;
    occurredAt: string;
    metadata: Record<string, string | boolean>;
  }): Promise<void> {
    await inTransaction(this.pool, input.actorSubject, input.tenantId, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [input.tenantId]);
      const updated = await client.query(
        `UPDATE tenant_controls
            SET paused_channels = CASE
              WHEN $2 THEN array_append(array_remove(paused_channels, $3), $3)
              ELSE array_remove(paused_channels, $3)
            END,
            updated_at = $4
          WHERE tenant_id = $1`,
        [input.tenantId, input.paused, input.channel, input.occurredAt]
      );
      if (updated.rowCount !== 1) throw new Error('Tenant control state not found');

      const previous = await client.query<{ event_hash: string }>(
        `SELECT event_hash FROM audit_events
          WHERE tenant_id = $1
          ORDER BY sequence_id DESC LIMIT 1`,
        [input.tenantId]
      );
      const auditInput = {
        tenantId: input.tenantId,
        actorSubject: input.actorSubject,
        action: input.paused ? 'channel.pause.enabled' : 'channel.pause.disabled',
        entityType: 'tenant_control',
        entityId: input.tenantId,
        occurredAt: input.occurredAt,
        metadata: input.metadata,
      };
      await appendAuditEvent(
        {
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
        },
        auditInput,
        previous.rows[0]?.event_hash ?? null
      );
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
      await appendAuditEvent(
        {
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
        },
        auditInput,
        previous.rows[0]?.event_hash ?? null
      );
    });
  }

  async acceptSprintContract(record: ConsentRecord): Promise<{ id: string; revision: number }> {
    return inTransaction(this.pool, record.subject, record.tenantId, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        record.tenantId,
      ]);
      const active = await client.query(
        `SELECT id FROM sprint_contracts WHERE tenant_id = $1 AND revoked_at IS NULL LIMIT 1`,
        [record.tenantId]
      );
      if (active.rows.length > 0) {
        throw new Error('Active Sprint Contract must be revoked before accepting a replacement');
      }
      const latest = await client.query<{ next_revision: number }>(
        `SELECT COALESCE(MAX(revision), 0) + 1 AS next_revision
           FROM sprint_contracts WHERE tenant_id = $1`,
        [record.tenantId]
      );
      const revision = Number(latest.rows[0]?.next_revision ?? 1);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO sprint_contracts
          (tenant_id, version, revision, contract_json, contract_hash, accepted_by,
           accepted_at, signature, revoked_at)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8, NULL)
         RETURNING id`,
        [
          record.tenantId,
          record.contract.version,
          revision,
          JSON.stringify(record.contract),
          record.contractHash,
          record.subject,
          record.acceptedAt,
          record.signature,
        ]
      );
      const id = inserted.rows[0]?.id;
      if (!id) throw new Error('Sprint Contract insert did not return an ID');
      const previous = await client.query<{ event_hash: string }>(
        `SELECT event_hash FROM audit_events WHERE tenant_id = $1
          ORDER BY sequence_id DESC LIMIT 1`,
        [record.tenantId]
      );
      await appendAuditEvent(
        {
          append: async (event: AuditRecord) => {
            await client.query(
              `INSERT INTO audit_events
              (tenant_id, actor_subject, action, entity_type, entity_id, occurred_at,
               metadata, previous_hash, event_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
              [
                event.tenantId,
                event.actorSubject,
                event.action,
                event.entityType,
                event.entityId,
                event.occurredAt,
                JSON.stringify(event.metadata ?? {}),
                event.previousHash,
                event.eventHash,
              ]
            );
          },
        },
        {
          tenantId: record.tenantId,
          actorSubject: record.subject,
          action: 'sprint_contract.accepted',
          entityType: 'sprint_contract',
          entityId: id,
          occurredAt: record.acceptedAt,
          metadata: { revision, contractHash: record.contractHash },
        },
        previous.rows[0]?.event_hash ?? null
      );
      return { id, revision };
    });
  }

  async getActiveSprintContract(
    tenantId: string
  ): Promise<(ConsentRecord & { id: string; revision: number }) | null> {
    return inTransaction(this.pool, 'system:api', tenantId, async (client) => {
      const result = await client.query<{
        id: string;
        revision: number;
        tenant_id: string;
        contract_json: ConsentRecord['contract'];
        contract_hash: string;
        accepted_by: string;
        accepted_at: Date | string;
        signature: string;
        revoked_at: Date | string | null;
      }>(
        `SELECT id, revision, tenant_id, contract_json, contract_hash, accepted_by,
                accepted_at, signature, revoked_at
           FROM sprint_contracts
          WHERE tenant_id = $1 AND revoked_at IS NULL
          ORDER BY revision DESC LIMIT 1`,
        [tenantId]
      );
      const row = result.rows[0];
      if (!row) return null;
      return {
        id: row.id,
        revision: Number(row.revision),
        tenantId: row.tenant_id,
        subject: row.accepted_by,
        contract: row.contract_json,
        contractHash: row.contract_hash,
        acceptedAt: new Date(row.accepted_at).toISOString(),
        signature: row.signature,
        revokedAt: row.revoked_at ? new Date(row.revoked_at).toISOString() : null,
      };
    });
  }

  async revokeSprintContract(input: {
    tenantId: string;
    subject: string;
    contractId: string;
    revokedAt: string;
    metadata: Record<string, string | boolean>;
  }): Promise<void> {
    await inTransaction(this.pool, input.subject, input.tenantId, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [input.tenantId]);
      const updated = await client.query(
        `UPDATE sprint_contracts SET revoked_at = $4
          WHERE tenant_id = $1 AND accepted_by = $2 AND id = $3 AND revoked_at IS NULL`,
        [input.tenantId, input.subject, input.contractId, input.revokedAt]
      );
      if (updated.rowCount !== 1) throw new Error('Active Sprint Contract not found');
      const previous = await client.query<{ event_hash: string }>(
        `SELECT event_hash FROM audit_events WHERE tenant_id = $1
          ORDER BY sequence_id DESC LIMIT 1`,
        [input.tenantId]
      );
      await appendAuditEvent(
        {
          append: async (event: AuditRecord) => {
            await client.query(
              `INSERT INTO audit_events
              (tenant_id, actor_subject, action, entity_type, entity_id, occurred_at,
               metadata, previous_hash, event_hash)
             VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)`,
              [
                event.tenantId,
                event.actorSubject,
                event.action,
                event.entityType,
                event.entityId,
                event.occurredAt,
                JSON.stringify(event.metadata ?? {}),
                event.previousHash,
                event.eventHash,
              ]
            );
          },
        },
        {
          tenantId: input.tenantId,
          actorSubject: input.subject,
          action: 'sprint_contract.revoked',
          entityType: 'sprint_contract',
          entityId: input.contractId,
          occurredAt: input.revokedAt,
          metadata: input.metadata,
        },
        previous.rows[0]?.event_hash ?? null
      );
    });
  }
}
