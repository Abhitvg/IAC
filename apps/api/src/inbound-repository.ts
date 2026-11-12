import type { SqlPool } from './postgres-repository';
import type { InboundCategory } from '../../../packages/cloud-core/src/inbound/classifier';

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

export interface InboundMessageRecord {
  id: string;
  tenantId: string;
  applicationId?: string | null;
  provider: 'google' | 'microsoft' | 'imap_smtp' | 'webhook';
  externalMessageId: string;
  threadId?: string | null;
  senderEmail: string;
  senderName?: string | null;
  subject: string;
  snippet?: string | null;
  classification: InboundCategory;
  requiresAction: boolean;
  handled: boolean;
  metadata: Record<string, unknown>;
  receivedAt: string;
  createdAt: string;
}

export interface InboundRepository {
  recordMessage(
    tenantId: string,
    message: Omit<InboundMessageRecord, 'id' | 'createdAt' | 'tenantId'>,
    actorSubject: string
  ): Promise<InboundMessageRecord>;
  listMessages(tenantId: string, limit?: number): Promise<InboundMessageRecord[]>;
  markHandled(tenantId: string, id: string, actorSubject: string): Promise<InboundMessageRecord>;
}

export class SqlInboundRepository implements InboundRepository {
  private readonly pool: SqlPool;

  constructor(pool: SqlPool) {
    this.pool = pool;
  }

  private mapRow(row: Record<string, unknown>): InboundMessageRecord {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      applicationId: row.application_id ? String(row.application_id) : null,
      provider: row.provider as any,
      externalMessageId: String(row.external_message_id),
      threadId: row.thread_id ? String(row.thread_id) : null,
      senderEmail: String(row.sender_email),
      senderName: row.sender_name ? String(row.sender_name) : null,
      subject: String(row.subject),
      snippet: row.snippet ? String(row.snippet) : null,
      classification: row.classification as InboundCategory,
      requiresAction: Boolean(row.requires_action),
      handled: Boolean(row.handled),
      metadata: (row.metadata as Record<string, unknown>) ?? {},
      receivedAt: new Date(row.received_at as string).toISOString(),
      createdAt: new Date(row.created_at as string).toISOString(),
    };
  }

  public async recordMessage(
    tenantId: string,
    message: Omit<InboundMessageRecord, 'id' | 'createdAt' | 'tenantId'>,
    actorSubject: string
  ): Promise<InboundMessageRecord> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      const res = await client.query(
        `
        INSERT INTO inbound_messages (
          tenant_id, application_id, provider, external_message_id, thread_id,
          sender_email, sender_name, subject, snippet, classification,
          requires_action, handled, metadata, received_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14)
        RETURNING *
      `,
        [
          tenantId,
          message.applicationId ?? null,
          message.provider,
          message.externalMessageId,
          message.threadId ?? null,
          message.senderEmail,
          message.senderName ?? null,
          message.subject,
          message.snippet ?? null,
          message.classification,
          message.requiresAction,
          message.handled,
          JSON.stringify(message.metadata),
          message.receivedAt,
        ]
      );
      return this.mapRow(res.rows[0]);
    });
  }

  public async listMessages(tenantId: string, limit = 50): Promise<InboundMessageRecord[]> {
    return withTenantClient(this.pool, tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM inbound_messages WHERE tenant_id = $1 ORDER BY received_at DESC LIMIT $2`,
        [tenantId, limit]
      );
      return res.rows.map((r) => this.mapRow(r));
    });
  }

  public async markHandled(
    tenantId: string,
    id: string,
    actorSubject: string
  ): Promise<InboundMessageRecord> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      const res = await client.query(
        `
        UPDATE inbound_messages
        SET handled = true
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
      `,
        [tenantId, id]
      );
      if (res.rows.length === 0) {
        throw new Error(`Inbound message not found: ${id}`);
      }
      return this.mapRow(res.rows[0]);
    });
  }
}
