import type { SqlPool } from './postgres-repository';
import type { Person, CrmStage, RoleDomain, Relationship, VerificationSource } from '../../../packages/cloud-core/src/person-graph/person-types';
import type { SuppressionEntry } from '../../../packages/cloud-core/src/outreach/compliance';
import type { MailboxMetrics } from '../../../packages/cloud-core/src/outreach/adaptive-caps';

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

export interface OutreachRepository {
  addPerson(
    tenantId: string,
    person: Omit<Person, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>,
    actorSubject: string
  ): Promise<Person>;
  listPeople(tenantId: string, company?: string): Promise<Person[]>;
  getPerson(tenantId: string, id: string): Promise<Person | null>;
  updatePersonStage(
    tenantId: string,
    id: string,
    stage: CrmStage,
    lastContactedAt?: string,
    actorSubject?: string
  ): Promise<Person>;
  addSuppression(
    tenantId: string,
    entry: { email?: string; domain?: string; reason: 'opt_out' | 'bounce' | 'spam_complaint' | 'manual' },
    actorSubject: string
  ): Promise<void>;
  listSuppression(tenantId: string): Promise<SuppressionEntry[]>;
  recordOutreachMessage(
    tenantId: string,
    message: {
      personId: string;
      applicationId?: string | null;
      sequenceStep: number;
      subject: string;
      bodyText: string;
      sentAt: string;
      status: string;
      metadata?: Record<string, unknown>;
    },
    actorSubject: string
  ): Promise<any>;
  listOutreachForCompany(tenantId: string, company: string): Promise<any[]>;
  getMailboxMetrics(tenantId: string): Promise<MailboxMetrics>;
}

export class SqlOutreachRepository implements OutreachRepository {
  private readonly pool: SqlPool;

  constructor(pool: SqlPool) {
    this.pool = pool;
  }

  private mapPerson(row: Record<string, unknown>): Person {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      email: String(row.email),
      name: String(row.name),
      company: String(row.company),
      title: String(row.title),
      roleDomain: row.role_domain as RoleDomain,
      relationship: row.relationship as Relationship,
      verificationSource: row.verification_source as VerificationSource,
      timeZone: String(row.time_zone || 'America/New_York'),
      linkedinUrl: row.linkedin_url ? String(row.linkedin_url) : undefined,
      lastContactedAt: row.last_contacted_at ? new Date(row.last_contacted_at as string).toISOString() : undefined,
      crmStage: row.crm_stage as CrmStage,
      notes: row.notes ? String(row.notes) : undefined,
      howICanHelp: row.how_i_can_help ? String(row.how_i_can_help) : undefined,
      createdAt: new Date(row.created_at as string).toISOString(),
      updatedAt: new Date(row.updated_at as string).toISOString(),
    };
  }

  public async addPerson(
    tenantId: string,
    person: Omit<Person, 'id' | 'createdAt' | 'updatedAt' | 'tenantId'>,
    actorSubject: string
  ): Promise<Person> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      const res = await client.query(
        `
        INSERT INTO people (
          tenant_id, email, name, company, title, role_domain, relationship,
          verification_source, time_zone, linkedin_url, last_contacted_at,
          crm_stage, notes, how_i_can_help
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (tenant_id, email) DO UPDATE
        SET name = EXCLUDED.name,
            company = EXCLUDED.company,
            title = EXCLUDED.title,
            role_domain = EXCLUDED.role_domain,
            relationship = EXCLUDED.relationship,
            verification_source = EXCLUDED.verification_source,
            time_zone = EXCLUDED.time_zone,
            notes = COALESCE(EXCLUDED.notes, people.notes),
            how_i_can_help = COALESCE(EXCLUDED.how_i_can_help, people.how_i_can_help),
            updated_at = now()
        RETURNING *
      `,
        [
          tenantId,
          person.email.toLowerCase().trim(),
          person.name.trim(),
          person.company.trim(),
          person.title.trim(),
          person.roleDomain,
          person.relationship,
          person.verificationSource,
          person.timeZone || 'America/New_York',
          person.linkedinUrl ?? null,
          person.lastContactedAt ?? null,
          person.crmStage || 'lead',
          person.notes ?? null,
          person.howICanHelp ?? null,
        ]
      );
      return this.mapPerson(res.rows[0]);
    });
  }

  public async listPeople(tenantId: string, company?: string): Promise<Person[]> {
    return withTenantClient(this.pool, tenantId, async (client) => {
      const sql = company
        ? `SELECT * FROM people WHERE tenant_id = $1 AND LOWER(company) = LOWER($2) ORDER BY created_at DESC`
        : `SELECT * FROM people WHERE tenant_id = $1 ORDER BY created_at DESC`;
      const params = company ? [tenantId, company] : [tenantId];
      const res = await client.query(sql, params);
      return res.rows.map((r) => this.mapPerson(r));
    });
  }

  public async getPerson(tenantId: string, id: string): Promise<Person | null> {
    return withTenantClient(this.pool, tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM people WHERE tenant_id = $1 AND id = $2`,
        [tenantId, id]
      );
      if (res.rows.length === 0) return null;
      return this.mapPerson(res.rows[0]);
    });
  }

  public async updatePersonStage(
    tenantId: string,
    id: string,
    stage: CrmStage,
    lastContactedAt?: string,
    actorSubject: string = 'user'
  ): Promise<Person> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      const res = await client.query(
        `
        UPDATE people
        SET crm_stage = $3,
            last_contacted_at = COALESCE($4, last_contacted_at),
            updated_at = now()
        WHERE tenant_id = $1 AND id = $2
        RETURNING *
      `,
        [tenantId, id, stage, lastContactedAt ?? null]
      );
      if (res.rows.length === 0) {
        throw new Error(`Person not found: ${id}`);
      }
      return this.mapPerson(res.rows[0]);
    });
  }

  public async addSuppression(
    tenantId: string,
    entry: { email?: string; domain?: string; reason: 'opt_out' | 'bounce' | 'spam_complaint' | 'manual' },
    actorSubject: string
  ): Promise<void> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      await client.query(
        `
        INSERT INTO suppression_list (tenant_id, email, domain, reason)
        VALUES ($1, $2, $3, $4)
      `,
        [
          tenantId,
          entry.email ? entry.email.toLowerCase().trim() : null,
          entry.domain ? entry.domain.toLowerCase().trim() : null,
          entry.reason,
        ]
      );
    });
  }

  public async listSuppression(tenantId: string): Promise<SuppressionEntry[]> {
    return withTenantClient(this.pool, tenantId, async (client) => {
      const res = await client.query(
        `SELECT email, domain, reason FROM suppression_list WHERE tenant_id = $1`,
        [tenantId]
      );
      return res.rows.map((r) => ({
        email: r.email ? String(r.email) : undefined,
        domain: r.domain ? String(r.domain) : undefined,
        reason: r.reason as any,
      }));
    });
  }

  public async recordOutreachMessage(
    tenantId: string,
    message: {
      personId: string;
      applicationId?: string | null;
      sequenceStep: number;
      subject: string;
      bodyText: string;
      sentAt: string;
      status: string;
      metadata?: Record<string, unknown>;
    },
    actorSubject: string
  ): Promise<any> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      const res = await client.query(
        `
        INSERT INTO outreach_messages (
          tenant_id, person_id, application_id, sequence_step, subject,
          body_text, sent_at, status, metadata
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
        RETURNING *
      `,
        [
          tenantId,
          message.personId,
          message.applicationId ?? null,
          message.sequenceStep,
          message.subject,
          message.bodyText,
          message.sentAt,
          message.status,
          JSON.stringify(message.metadata ?? {}),
        ]
      );
      return res.rows[0];
    });
  }

  public async listOutreachForCompany(tenantId: string, company: string): Promise<any[]> {
    return withTenantClient(this.pool, tenantId, async (client) => {
      const res = await client.query(
        `
        SELECT om.*, p.company, p.title as person_title
        FROM outreach_messages om
        JOIN people p ON om.person_id = p.id
        WHERE om.tenant_id = $1 AND LOWER(p.company) = LOWER($2)
      `,
        [tenantId, company]
      );
      return res.rows;
    });
  }

  public async getMailboxMetrics(tenantId: string): Promise<MailboxMetrics> {
    return withTenantClient(this.pool, tenantId, async (client) => {
      const res = await client.query<{
        total_sent: string | number;
        bounces: string | number;
        complaints: string | number;
        replies: string | number;
      }>(
        `
        SELECT
          COUNT(*) FILTER (WHERE status != 'opted_out') as total_sent,
          COUNT(*) FILTER (WHERE status = 'bounced') as bounces,
          COUNT(*) FILTER (WHERE status = 'replied') as replies
        FROM outreach_messages
        WHERE tenant_id = $1
      `,
        [tenantId]
      );

      const row = res.rows[0];
      const sent = Number(row?.total_sent || 0);
      const bounces = Number(row?.bounces || 0);
      const replies = Number(row?.replies || 0);

      // Check suppression list for spam complaints
      const complaintsRes = await client.query<{ count: string | number }>(
        `SELECT COUNT(*) as count FROM suppression_list WHERE tenant_id = $1 AND reason = 'spam_complaint'`,
        [tenantId]
      );
      const complaints = Number(complaintsRes.rows[0]?.count || 0);

      return {
        sentCount: sent,
        deliveredCount: Math.max(0, sent - bounces),
        bounceCount: bounces,
        complaintCount: complaints,
        replyCount: replies,
      };
    });
  }
}

