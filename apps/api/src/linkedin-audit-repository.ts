import type { SqlPool } from './postgres-repository';
import type { ProfileAuditResult } from '../../../packages/cloud-core/src/linkedin/profile-audit';

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

export interface LinkedInAuditRepository {
  saveAudit(
    tenantId: string,
    audit: ProfileAuditResult,
    actorSubject: string
  ): Promise<any>;
  getLatestAudit(tenantId: string): Promise<any | null>;
}

export class SqlLinkedInAuditRepository implements LinkedInAuditRepository {
  private readonly pool: SqlPool;

  constructor(pool: SqlPool) {
    this.pool = pool;
  }

  public async saveAudit(
    tenantId: string,
    audit: ProfileAuditResult,
    actorSubject: string
  ): Promise<any> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      const res = await client.query(
        `
        INSERT INTO linkedin_profile_audits (
          tenant_id, overall_score, headline_score, about_score, skills_score,
          suggested_headline, suggested_about, recommendations, open_to_work_guidance
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9::jsonb)
        RETURNING *
      `,
        [
          tenantId,
          audit.overallScore,
          audit.headlineScore,
          audit.aboutScore,
          audit.skillsScore,
          audit.suggestedHeadline,
          audit.suggestedAbout,
          JSON.stringify(audit.recommendations),
          JSON.stringify(audit.openToWorkGuidance),
        ]
      );
      return res.rows[0];
    });
  }

  public async getLatestAudit(tenantId: string): Promise<any | null> {
    return withTenantClient(this.pool, tenantId, async (client) => {
      const res = await client.query(
        `SELECT * FROM linkedin_profile_audits WHERE tenant_id = $1 ORDER BY audited_at DESC LIMIT 1`,
        [tenantId]
      );
      return res.rows[0] || null;
    });
  }
}
