import { resolve } from 'node:path';
import { Pool } from 'pg';
import { loadCloudMigrations, runCloudMigrations } from '../apps/api/src/migrations';
import { createPostgresPoolFromUrl } from '../apps/api/src/postgres-pool';

async function migrate(): Promise<void> {
  const connectionString = process.env.CAREEROPS_MIGRATION_DATABASE_URL;
  if (!connectionString) {
    throw new Error('CAREEROPS_MIGRATION_DATABASE_URL is required for schema migrations');
  }

  const nodeEnvironment =
    process.env.NODE_ENV === 'production' ? 'production' : process.env.NODE_ENV === 'test' ? 'test' : 'development';
  const pool = createPostgresPoolFromUrl(connectionString, nodeEnvironment, 1);

  try {
    const directory = resolve(process.cwd(), 'apps/api/migrations');
    const migrations = await loadCloudMigrations(directory);
    const result = await runCloudMigrations(pool, migrations);
    console.info(
      JSON.stringify({
        applied: result.applied,
        skipped: result.skipped,
        migrationCount: migrations.length,
      })
    );
  } finally {
    await pool.end();
  }
}

void migrate().catch((error: unknown) => {
  console.error(
    'CareerOps database migration failed:',
    error instanceof Error ? error.message : 'Unknown migration error'
  );
  process.exitCode = 1;
});
