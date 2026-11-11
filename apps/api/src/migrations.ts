import { createHash } from 'node:crypto';
import { readdir, readFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';

interface MigrationQueryResult<Row = Record<string, unknown>> {
  rows: Row[];
  rowCount?: number | null;
}

interface MigrationClient {
  query<Row = Record<string, unknown>>(
    sql: string,
    values?: unknown[]
  ): Promise<MigrationQueryResult<Row>>;
  release(): void;
}

interface MigrationPool {
  connect(): Promise<MigrationClient>;
}

export interface CloudMigration {
  name: string;
  sql: string;
}

export interface CloudMigrationResult {
  applied: string[];
  skipped: string[];
}

const MIGRATION_NAME = /^\\d{4}_[a-z0-9_]+\\.sql$/;
const ADVISORY_LOCK_NAMESPACE = 741923;
const ADVISORY_LOCK_ID = 5;

function normalizeMigrationSql(sql: string): string {
  let normalized = sql.trim();
  normalized = normalized.replace(/^BEGIN\\s*;\\s*/i, '');
  normalized = normalized.replace(/\\s*COMMIT\\s*;?\\s*$/i, '');
  if (!normalized.trim()) throw new Error('Migration SQL must not be empty');
  return normalized;
}

function validateMigrations(migrations: CloudMigration[]): CloudMigration[] {
  const names = new Set<string>();
  const versions = new Set<string>();
  for (const migration of migrations) {
    if (!MIGRATION_NAME.test(migration.name)) {
      throw new Error(`Invalid cloud migration filename: ${migration.name}`);
    }
    const version = migration.name.slice(0, 4);
    if (names.has(migration.name) || versions.has(version)) {
      throw new Error(`Duplicate cloud migration version: ${version}`);
    }
    if (!migration.sql.trim()) {
      throw new Error(`Cloud migration is empty: ${migration.name}`);
    }
    names.add(migration.name);
    versions.add(version);
  }
  return [...migrations].sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0));
}

export async function loadCloudMigrations(directory: string): Promise<CloudMigration[]> {
  const absoluteDirectory = resolve(directory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const sqlEntries = entries.filter((entry) => entry.name.endsWith('.sql'));
  for (const entry of sqlEntries) {
    if (!entry.isFile()) {
      throw new Error(`Cloud migration must be a regular file: ${entry.name}`);
    }
    if (!MIGRATION_NAME.test(entry.name)) {
      throw new Error(`Invalid cloud migration filename: ${entry.name}`);
    }
  }
  const files = sqlEntries.map((entry) => entry.name).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));

  return Promise.all(
    files.map(async (name) => ({
      name,
      sql: await readFile(join(absoluteDirectory, name), 'utf8'),
    }))
  );
}

export async function runCloudMigrations(
  pool: MigrationPool,
  migrations: CloudMigration[]
): Promise<CloudMigrationResult> {
  const ordered = validateMigrations(migrations);
  const client = await pool.connect();
  const applied: string[] = [];
  const skipped: string[] = [];
  let lockAcquired = false;

  try {
    await client.query('SELECT pg_advisory_lock($1, $2)', [
      ADVISORY_LOCK_NAMESPACE,
      ADVISORY_LOCK_ID,
    ]);
    lockAcquired = true;

    // A database may predate the checksum ledger (for example, it may have been
    // initialized by the disposable integration script). Never silently bless or
    // replay that schema: a reviewed baseline must be recorded explicitly.
    const schemaState = await client.query<{
      ledger_table: string | null;
      existing_tables: string[];
    }>(`
      SELECT
        to_regclass('public.careerops_schema_migrations')::text AS ledger_table,
        ARRAY_REMOVE(ARRAY[
          to_regclass('public.tenants')::text,
          to_regclass('public.tenant_memberships')::text,
          to_regclass('public.tenant_controls')::text,
          to_regclass('public.sprint_contracts')::text,
          to_regclass('public.audit_events')::text,
          to_regclass('public.api_rate_limit_buckets')::text
        ], NULL) AS existing_tables
    `);
    const ledgerExists = Boolean(schemaState.rows[0]?.ledger_table);
    const preExistingTables = schemaState.rows[0]?.existing_tables ?? [];
    const ledgerCountResult = ledgerExists
      ? await client.query<{ migration_count: number | string }>(
          'SELECT COUNT(*)::int AS migration_count FROM careerops_schema_migrations'
        )
      : null;
    const ledgerEntryCount = Number(ledgerCountResult?.rows[0]?.migration_count ?? 0);
    if (preExistingTables.length > 0 && (!ledgerExists || ledgerEntryCount === 0)) {
      throw new Error(
        'Existing CareerOps schema detected without a populated migration ledger; an explicit reviewed baseline is required before applying migrations'
      );
    }

    if (!ledgerExists) {
      await client.query(`
        CREATE TABLE careerops_schema_migrations (
          name text PRIMARY KEY,
          checksum char(64) NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);
    }

    for (const migration of ordered) {
      const checksum = createHash('sha256').update(migration.sql, 'utf8').digest('hex');
      const existing = await client.query<{ checksum: string }>(
        'SELECT checksum FROM careerops_schema_migrations WHERE name = $1',
        [migration.name]
      );

      if (existing.rows.length > 0) {
        if (existing.rows[0].checksum.trim() !== checksum) {
          throw new Error(`Applied cloud migration was modified: ${migration.name}`);
        }
        skipped.push(migration.name);
        continue;
      }

      await client.query('BEGIN');
      try {
        await client.query(normalizeMigrationSql(migration.sql));
        await client.query(
          'INSERT INTO careerops_schema_migrations (name, checksum) VALUES ($1, $2)',
          [migration.name, checksum]
        );
        await client.query('COMMIT');
        applied.push(migration.name);
      } catch (error) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // Preserve the migration failure.
        }
        throw error;
      }
    }

    return { applied, skipped };
  } finally {
    try {
      if (lockAcquired) {
        await client.query('SELECT pg_advisory_unlock($1, $2)', [
          ADVISORY_LOCK_NAMESPACE,
          ADVISORY_LOCK_ID,
        ]);
      }
    } finally {
      client.release();
    }
  }
}
