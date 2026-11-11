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

const MIGRATION_NAME = /^\d{4}_[a-z0-9_]+\.sql$/;
const ADVISORY_LOCK_NAMESPACE = 741923;
const ADVISORY_LOCK_ID = 5;

function normalizeMigrationSql(sql: string): string {
  let normalized = sql.trim();
  normalized = normalized.replace(/^BEGIN\s*;\s*/i, '');
  normalized = normalized.replace(/\s*COMMIT\s*;?\s*$/i, '');
  if (!normalized.trim()) throw new Error('Migration SQL must not be empty');
  return normalized;
}

function validateMigrations(migrations: CloudMigration[]): CloudMigration[] {
  const names = new Set<string>();
  for (const migration of migrations) {
    if (!MIGRATION_NAME.test(migration.name)) {
      throw new Error(`Invalid cloud migration filename: ${migration.name}`);
    }
    if (names.has(migration.name)) {
      throw new Error(`Duplicate cloud migration filename: ${migration.name}`);
    }
    if (!migration.sql.trim()) {
      throw new Error(`Cloud migration is empty: ${migration.name}`);
    }
    names.add(migration.name);
  }
  return [...migrations].sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadCloudMigrations(directory: string): Promise<CloudMigration[]> {
  const absoluteDirectory = resolve(directory);
  const entries = await readdir(absoluteDirectory, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && MIGRATION_NAME.test(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b));

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

    await client.query(`
      CREATE TABLE IF NOT EXISTS careerops_schema_migrations (
        name text PRIMARY KEY,
        checksum char(64) NOT NULL,
        applied_at timestamptz NOT NULL DEFAULT now()
      )
    `);

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
