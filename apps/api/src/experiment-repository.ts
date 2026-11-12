import type { SqlPool } from './postgres-repository';
import type {
  ExperimentDefinition,
  ExperimentVariant,
} from '../../../packages/cloud-core/src/experiments/types';

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

export interface ExperimentRepository {
  createExperiment(
    tenantId: string,
    experiment: ExperimentDefinition,
    actorSubject: string
  ): Promise<ExperimentDefinition>;
  listExperiments(tenantId: string): Promise<ExperimentDefinition[]>;
  getExperiment(tenantId: string, experimentId: string): Promise<ExperimentDefinition | null>;
  recordEvent(
    tenantId: string,
    experimentId: string,
    variantId: string,
    eventType: 'impression' | 'conversion' | 'reply' | 'interview',
    actorSubject: string
  ): Promise<void>;
  createDsarRequest(
    tenantId: string,
    requestType: 'export' | 'delete',
    requesterSubject: string
  ): Promise<{ id: string }>;
  executeTenantPurge(
    tenantId: string,
    requesterSubject: string
  ): Promise<{
    careerGraphFacts: number;
    contracts: number;
    applications: number;
    people: number;
    outreachMessages: number;
    sprintRuns: number;
  }>;
}

export class SqlExperimentRepository implements ExperimentRepository {
  private readonly pool: SqlPool;

  constructor(pool: SqlPool) {
    this.pool = pool;
  }

  public async createExperiment(
    tenantId: string,
    experiment: ExperimentDefinition,
    actorSubject: string
  ): Promise<ExperimentDefinition> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      const expRes = await client.query<Record<string, unknown>>(
        `
        INSERT INTO experiments (
          id, tenant_id, name, target_dimension, status, min_sample_size,
          metadata, created_at, updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8, $9)
        RETURNING *
      `,
        [
          experiment.id,
          tenantId,
          experiment.name,
          experiment.targetDimension,
          experiment.status,
          experiment.minSampleSize,
          JSON.stringify(experiment.metadata || {}),
          experiment.createdAt,
          experiment.updatedAt,
        ]
      );

      for (const variant of experiment.variants) {
        await client.query(
          `
          INSERT INTO experiment_variants (
            id, experiment_id, tenant_id, name, content,
            allocation_weight, impressions, conversions
          )
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        `,
          [
            variant.id,
            experiment.id,
            tenantId,
            variant.name,
            variant.content,
            variant.allocationWeight,
            variant.impressions,
            variant.conversions,
          ]
        );
      }

      return this.mapExperimentRow(expRes.rows[0], experiment.variants);
    });
  }

  public async listExperiments(tenantId: string): Promise<ExperimentDefinition[]> {
    return withTenantClient(this.pool, tenantId, async (client) => {
      const expRes = await client.query<Record<string, unknown>>(
        'SELECT * FROM experiments WHERE tenant_id = $1 ORDER BY created_at DESC',
        [tenantId]
      );

      const experiments: ExperimentDefinition[] = [];
      for (const row of expRes.rows) {
        const variantsRes = await client.query<Record<string, unknown>>(
          'SELECT * FROM experiment_variants WHERE experiment_id = $1 AND tenant_id = $2',
          [row.id, tenantId]
        );
        experiments.push(this.mapExperimentRow(row, variantsRes.rows.map(this.mapVariantRow)));
      }

      return experiments;
    });
  }

  public async getExperiment(tenantId: string, experimentId: string): Promise<ExperimentDefinition | null> {
    return withTenantClient(this.pool, tenantId, async (client) => {
      const expRes = await client.query<Record<string, unknown>>(
        'SELECT * FROM experiments WHERE id = $1 AND tenant_id = $2',
        [experimentId, tenantId]
      );
      if (expRes.rows.length === 0) return null;

      const variantsRes = await client.query<Record<string, unknown>>(
        'SELECT * FROM experiment_variants WHERE experiment_id = $1 AND tenant_id = $2',
        [experimentId, tenantId]
      );

      return this.mapExperimentRow(expRes.rows[0], variantsRes.rows.map(this.mapVariantRow));
    });
  }

  public async recordEvent(
    tenantId: string,
    experimentId: string,
    variantId: string,
    eventType: 'impression' | 'conversion' | 'reply' | 'interview',
    actorSubject: string
  ): Promise<void> {
    return inTenantTransaction(this.pool, tenantId, actorSubject, async (client) => {
      await client.query(
        `
        INSERT INTO experiment_events (
          tenant_id, experiment_id, variant_id, event_type, created_at
        )
        VALUES ($1, $2, $3, $4, now())
      `,
        [tenantId, experimentId, variantId, eventType]
      );

      if (eventType === 'impression') {
        await client.query(
          `
          UPDATE experiment_variants
          SET impressions = impressions + 1
          WHERE experiment_id = $1 AND id = $2 AND tenant_id = $3
        `,
          [experimentId, variantId, tenantId]
        );
      } else {
        await client.query(
          `
          UPDATE experiment_variants
          SET conversions = conversions + 1
          WHERE experiment_id = $1 AND id = $2 AND tenant_id = $3
        `,
          [experimentId, variantId, tenantId]
        );
      }
    });
  }

  public async createDsarRequest(
    tenantId: string,
    requestType: 'export' | 'delete',
    requesterSubject: string
  ): Promise<{ id: string }> {
    return inTenantTransaction(this.pool, tenantId, requesterSubject, async (client) => {
      const res = await client.query<Record<string, unknown>>(
        `
        INSERT INTO dsar_requests (tenant_id, request_type, status, requester_subject)
        VALUES ($1, $2, 'completed', $3)
        RETURNING id
      `,
        [tenantId, requestType, requesterSubject]
      );
      return { id: String(res.rows[0].id) };
    });
  }

  public async executeTenantPurge(
    tenantId: string,
    requesterSubject: string
  ): Promise<{
    careerGraphFacts: number;
    contracts: number;
    applications: number;
    people: number;
    outreachMessages: number;
    sprintRuns: number;
  }> {
    return inTenantTransaction(this.pool, tenantId, requesterSubject, async (client) => {
      const fRes = await client.query('DELETE FROM career_graph_facts WHERE tenant_id = $1', [tenantId]);
      const cRes = await client.query('DELETE FROM sprint_contracts WHERE tenant_id = $1', [tenantId]);
      const aRes = await client.query('DELETE FROM applications WHERE tenant_id = $1', [tenantId]);
      const pRes = await client.query('DELETE FROM people WHERE tenant_id = $1', [tenantId]);
      const oRes = await client.query('DELETE FROM outreach_messages WHERE tenant_id = $1', [tenantId]);
      const sRes = await client.query('DELETE FROM sprint_runs WHERE tenant_id = $1', [tenantId]);

      return {
        careerGraphFacts: fRes.rowCount || 0,
        contracts: cRes.rowCount || 0,
        applications: aRes.rowCount || 0,
        people: pRes.rowCount || 0,
        outreachMessages: oRes.rowCount || 0,
        sprintRuns: sRes.rowCount || 0,
      };
    });
  }

  private mapExperimentRow(row: Record<string, unknown>, variants: ExperimentVariant[]): ExperimentDefinition {
    return {
      id: String(row.id),
      tenantId: String(row.tenant_id),
      name: String(row.name),
      targetDimension: row.target_dimension as any,
      status: row.status as any,
      minSampleSize: Number(row.min_sample_size),
      winnerVariantId: row.winner_variant_id ? String(row.winner_variant_id) : undefined,
      variants,
      metadata: typeof row.metadata === 'string' ? JSON.parse(row.metadata) : (row.metadata as any) || {},
      createdAt: new Date(String(row.created_at)).toISOString(),
      updatedAt: new Date(String(row.updated_at)).toISOString(),
    };
  }

  private mapVariantRow(row: Record<string, unknown>): ExperimentVariant {
    return {
      id: String(row.id),
      name: String(row.name),
      content: String(row.content),
      allocationWeight: Number(row.allocation_weight),
      impressions: Number(row.impressions),
      conversions: Number(row.conversions),
    };
  }
}
