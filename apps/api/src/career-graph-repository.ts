import { appendAuditEvent, type AuditRecord } from '../../../packages/cloud-core/src/audit';
import {
  assertReviewAllowed,
  type CareerGraphFact,
  type CareerGraphFactInput,
  type CareerGraphFactReview,
  type EncryptedFactEnvelope,
} from '../../../packages/cloud-core/src/career-graph';
import type { SqlPool } from './postgres-repository';

interface QueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount?: number | null;
}

interface SqlClient {
  query<Row = Record<string, unknown>>(sql: string, values?: unknown[]): Promise<QueryResult<Row>>;
  release(): void;
}

interface FactRow {
  id: string;
  tenant_id: string;
  fact_key: string;
  version: number;
  value_envelope: CareerGraphFact['valueEnvelope'];
  source_kind: CareerGraphFactInput['source']['kind'];
  source_reference: string | null;
  evidence_sha256: string | null;
  created_by: string;
  created_at: Date | string;
  decision: CareerGraphFactReview['decision'] | null;
  reason: string | null;
  reviewed_by: string | null;
  reviewed_at: Date | string | null;
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
      // Preserve the original transaction error.
    }
    throw error;
  } finally {
    client.release();
  }
}

function mapFact(row: FactRow): CareerGraphFact {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    factKey: row.fact_key,
    version: Number(row.version),
    valueEnvelope: row.value_envelope,
    source: {
      kind: row.source_kind,
      ...(row.source_reference ? { reference: row.source_reference } : {}),
      ...(row.evidence_sha256 ? { evidenceSha256: row.evidence_sha256.trim() } : {}),
    },
    createdBy: row.created_by,
    createdAt: new Date(row.created_at).toISOString(),
    review:
      row.decision && row.reviewed_by && row.reviewed_at
        ? {
            decision: row.decision,
            ...(row.reason ? { reason: row.reason } : {}),
            reviewedBy: row.reviewed_by,
            reviewedAt: new Date(row.reviewed_at).toISOString(),
          }
        : null,
  };
}

const FACT_SELECT = `
  SELECT f.id, f.tenant_id, f.fact_key, f.version,
         f.source_kind, f.source_reference, f.evidence_sha256, f.created_by, f.created_at,
         COALESCE(er.value_envelope, f.value_envelope) AS value_envelope,
         r.decision, r.reason, r.reviewed_by, r.reviewed_at
    FROM career_graph_facts f
    LEFT JOIN LATERAL (
      SELECT value_envelope
        FROM career_graph_fact_envelope_revisions
       WHERE tenant_id = f.tenant_id AND fact_id = f.id
       ORDER BY revision DESC
       LIMIT 1
    ) er ON TRUE
    LEFT JOIN career_graph_fact_reviews r
      ON r.tenant_id = f.tenant_id AND r.fact_id = f.id
`;

export class PostgresCareerGraphRepository {
  constructor(private readonly pool: SqlPool) {}

  /**
   * Re-encrypt a bounded tenant-scoped page and append immutable envelope revisions.
   * The job cursor is committed in the same transaction as the ciphertext revisions,
   * so a restarted worker resumes without skipping or duplicating committed work.
   */
  async rotateEnvelopeBatch(input: {
    tenantId: string;
    actorSubject: string;
    targetKeyVersion: string;
    limit: number;
    reencrypt: (
      envelope: EncryptedFactEnvelope,
      tenantId: string,
      context: string
    ) => Promise<EncryptedFactEnvelope>;
  }): Promise<{ rotated: number; nextCursor: string | null; hasMore: boolean }> {
    if (
      !input.tenantId ||
      !input.actorSubject ||
      !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(input.targetKeyVersion) ||
      !Number.isInteger(input.limit) ||
      input.limit < 1 ||
      input.limit > 100
    ) {
      throw new Error('Invalid Career Graph envelope rotation batch');
    }

    return inTenantTransaction(this.pool, input.tenantId, input.actorSubject, async (client) => {
      // Serialize all rotation workers for a tenant and target key version.
      await client.query(
        'SELECT pg_advisory_xact_lock(hashtextextended($1, 0))',
        [`career-graph-envelope-rotation:${input.tenantId}:${input.targetKeyVersion}`]
      );

      await client.query(
        `INSERT INTO career_graph_envelope_rotation_jobs
          (tenant_id, target_key_version, created_by, updated_by)
         VALUES ($1, $2, $3, $3)
         ON CONFLICT (tenant_id, target_key_version) DO NOTHING`,
        [input.tenantId, input.targetKeyVersion, input.actorSubject]
      );

      const jobResult = await client.query<{
        last_fact_id: string | null;
        rotated_count: number;
        status: 'running' | 'completed';
      }>(
        `SELECT last_fact_id, rotated_count, status
           FROM career_graph_envelope_rotation_jobs
          WHERE tenant_id = $1 AND target_key_version = $2
          FOR UPDATE`,
        [input.tenantId, input.targetKeyVersion]
      );
      const job = jobResult.rows[0];
      if (!job) throw new Error('Career Graph rotation job is unavailable to this actor');
      if (job.status === 'completed') {
        return {
          rotated: 0,
          nextCursor: job.last_fact_id,
          hasMore: false,
        };
      }

      const candidates = await client.query<{
        id: string;
        fact_key: string;
        value_envelope: EncryptedFactEnvelope;
      }>(
        `SELECT f.id, f.fact_key,
                COALESCE(er.value_envelope, f.value_envelope) AS value_envelope
           FROM career_graph_facts f
           LEFT JOIN LATERAL (
             SELECT value_envelope
               FROM career_graph_fact_envelope_revisions
              WHERE tenant_id = f.tenant_id AND fact_id = f.id
              ORDER BY revision DESC
              LIMIT 1
           ) er ON TRUE
          WHERE f.tenant_id = $1
            AND ($2::uuid IS NULL OR f.id > $2::uuid)
            AND COALESCE(er.value_envelope, f.value_envelope)->>'keyVersion' <> $3
          ORDER BY f.id ASC
          LIMIT $4
          FOR UPDATE OF f`,
        [input.tenantId, job.last_fact_id, input.targetKeyVersion, input.limit + 1]
      );

      const hasMore = candidates.rows.length > input.limit;
      const page = candidates.rows.slice(0, input.limit);
      let rotated = 0;
      let nextCursor = job.last_fact_id;

      for (const row of page) {
        const context = `career-graph:${row.fact_key}`;
        const replacement = await input.reencrypt(row.value_envelope, input.tenantId, context);
        if (
          replacement.tenantId !== input.tenantId ||
          replacement.context !== context ||
          replacement.keyVersion !== input.targetKeyVersion ||
          replacement.algorithm !== 'A256GCM'
        ) {
          throw new Error('Rotation provider returned an envelope with an unexpected context or key version');
        }

        const latest = await client.query<{ next_revision: number }>(
          `SELECT COALESCE(MAX(revision), 1) + 1 AS next_revision
             FROM career_graph_fact_envelope_revisions
            WHERE tenant_id = $1 AND fact_id = $2`,
          [input.tenantId, row.id]
        );
        const revision = Number(latest.rows[0]?.next_revision ?? 2);
        const inserted = await client.query(
          `INSERT INTO career_graph_fact_envelope_revisions
            (tenant_id, fact_id, revision, value_envelope, rotated_by)
           VALUES ($1, $2, $3, $4::jsonb, $5)`,
          [input.tenantId, row.id, revision, JSON.stringify(replacement), input.actorSubject]
        );
        if (inserted.rowCount !== 1) {
          throw new Error('Career Graph envelope revision was not persisted');
        }
        rotated += 1;
        nextCursor = row.id;
      }

      const updated = await client.query(
        `UPDATE career_graph_envelope_rotation_jobs
            SET last_fact_id = $3,
                rotated_count = rotated_count + $4,
                status = $5,
                updated_by = $6,
                updated_at = now()
          WHERE tenant_id = $1 AND target_key_version = $2`,
        [
          input.tenantId,
          input.targetKeyVersion,
          nextCursor,
          rotated,
          hasMore ? 'running' : 'completed',
          input.actorSubject,
        ]
      );
      if (updated.rowCount !== 1) throw new Error('Career Graph rotation cursor was not persisted');

      if (rotated > 0) {
        await this.appendAudit(client, {
          tenantId: input.tenantId,
          actorSubject: input.actorSubject,
          action: 'career_graph.envelopes.rotated',
          entityType: 'career_graph_envelope_batch',
          entityId: input.tenantId,
          occurredAt: new Date().toISOString(),
          metadata: {
            rotated,
            targetKeyVersion: input.targetKeyVersion,
            lastFactId: nextCursor,
          },
        });
      }

      return { rotated, nextCursor, hasMore };
    });
  }

  async createFact(
    tenantId: string,
    actorSubject: string,
    input: CareerGraphFactInput
  ): Promise<CareerGraphFact> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      // Match the trigger's lock key before calculating MAX(version), preventing stale versions.
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [
        `${tenantId}:${input.factKey}`,
      ]);
      const latest = await client.query<{ next_version: number }>(
        `SELECT COALESCE(MAX(version), 0) + 1 AS next_version
           FROM career_graph_facts
          WHERE tenant_id = $1 AND fact_key = $2`,
        [tenantId, input.factKey]
      );
      const version = Number(latest.rows[0]?.next_version ?? 1);
      const inserted = await client.query<{ id: string }>(
        `INSERT INTO career_graph_facts
          (tenant_id, fact_key, version, value_envelope, source_kind,
           source_reference, evidence_sha256, created_by)
         VALUES ($1, $2, $3, $4::jsonb, $5, $6, $7, $8)
         RETURNING id`,
        [
          tenantId,
          input.factKey,
          version,
          JSON.stringify(input.valueEnvelope),
          input.source.kind,
          input.source.reference ?? null,
          input.source.evidenceSha256 ?? null,
          actorSubject,
        ]
      );
      const id = inserted.rows[0]?.id;
      if (!id) throw new Error('Career Graph fact insert did not return an ID');
      await this.appendAudit(client, {
        tenantId,
        actorSubject,
        action: 'career_graph.fact.created',
        entityType: 'career_graph_fact',
        entityId: id,
        occurredAt: new Date().toISOString(),
        metadata: { factKey: input.factKey, version },
      });
      const selected = await client.query<FactRow>(
        `${FACT_SELECT}
          WHERE f.tenant_id = $1 AND f.id = $2`,
        [tenantId, id]
      );
      if (!selected.rows[0]) throw new Error('Created Career Graph fact could not be read');
      return mapFact(selected.rows[0]);
    });
  }

  async listFacts(
    tenantId: string,
    actorSubject: string,
    limit: number
  ): Promise<CareerGraphFact[]> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      const result = await client.query<FactRow>(
        `${FACT_SELECT}
          JOIN (
            SELECT tenant_id, fact_key, MAX(version) AS version
              FROM career_graph_facts
             WHERE tenant_id = $1
             GROUP BY tenant_id, fact_key
          ) latest
            ON latest.tenant_id = f.tenant_id
           AND latest.fact_key = f.fact_key
           AND latest.version = f.version
         WHERE f.tenant_id = $1
         ORDER BY f.fact_key ASC
         LIMIT $2`,
        [tenantId, limit]
      );
      return result.rows.map(mapFact);
    });
  }

  async reviewFact(
    tenantId: string,
    actorSubject: string,
    factId: string,
    input: CareerGraphFactReview
  ): Promise<CareerGraphFact> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [tenantId]);
      const existing = await client.query<FactRow>(
        `${FACT_SELECT}
          WHERE f.tenant_id = $1 AND f.id = $2
          FOR UPDATE OF f`,
        [tenantId, factId]
      );
      const row = existing.rows[0];
      if (!row) throw new Error('Career Graph fact not found');
      const fact = mapFact(row);
      assertReviewAllowed(fact, actorSubject, input.decision);
      const inserted = await client.query(
        `INSERT INTO career_graph_fact_reviews
          (tenant_id, fact_id, decision, reviewed_by, reason)
         VALUES ($1, $2, $3, $4, $5)`,
        [tenantId, factId, input.decision, actorSubject, input.reason ?? null]
      );
      if (inserted.rowCount !== 1) throw new Error('Career Graph review was not persisted');
      await this.appendAudit(client, {
        tenantId,
        actorSubject,
        action: `career_graph.fact.${input.decision}`,
        entityType: 'career_graph_fact',
        entityId: factId,
        occurredAt: new Date().toISOString(),
        metadata: { factKey: fact.factKey, version: fact.version },
      });
      const selected = await client.query<FactRow>(
        `${FACT_SELECT}
          WHERE f.tenant_id = $1 AND f.id = $2`,
        [tenantId, factId]
      );
      if (!selected.rows[0]) throw new Error('Reviewed Career Graph fact could not be read');
      return mapFact(selected.rows[0]);
    });
  }

  private async appendAudit(
    client: SqlClient,
    input: {
      tenantId: string;
      actorSubject: string;
      action: string;
      entityType: string;
      entityId: string;
      occurredAt: string;
      metadata: Record<string, string | number | boolean | null>;
    }
  ): Promise<void> {
    // Serialize every tenant audit append to preserve a single hash chain.
    await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [input.tenantId]);
    const previous = await client.query<{ event_hash: string }>(
      `SELECT event_hash FROM audit_events
        WHERE tenant_id = $1
        ORDER BY sequence_id DESC LIMIT 1`,
      [input.tenantId]
    );
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
      input,
      previous.rows[0]?.event_hash ?? null
    );
  }
}
