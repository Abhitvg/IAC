import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  loadCloudMigrations,
  runCloudMigrations,
  type CloudMigration,
} from '../apps/api/src/migrations';

function createPool(existing: Record<string, string> = {}) {
  const calls: Array<{ sql: string; values?: unknown[] }> = [];
  const client = {
    async query<Row = Record<string, unknown>>(sql: string, values?: unknown[]) {
      calls.push({ sql, values });
      if (sql.startsWith('SELECT checksum')) {
        const name = String(values?.[0]);
        const checksum = existing[name];
        return { rows: (checksum ? [{ checksum }] : []) as Row[] };
      }
      return { rows: [] as Row[] };
    },
    release: vi.fn(),
  };
  return { pool: { connect: async () => client }, calls, client };
}

describe('cloud database migrations', () => {
  let directory: string | undefined;

  afterEach(async () => {
    if (directory) await rm(directory, { recursive: true, force: true });
    directory = undefined;
  });

  it('loads only safe migration filenames in lexical order', async () => {
    directory = await mkdtemp(join(tmpdir(), 'careerops-migrations-'));
    await writeFile(join(directory, '0002_second.sql'), 'SELECT 2;');
    await writeFile(join(directory, '0001_first.sql'), 'SELECT 1;');
    await writeFile(join(directory, 'README.md'), 'ignored');

    await expect(loadCloudMigrations(directory)).resolves.toEqual([
      { name: '0001_first.sql', sql: 'SELECT 1;' },
      { name: '0002_second.sql', sql: 'SELECT 2;' },
    ]);
  });

  it('applies each migration and records its checksum under one advisory lock', async () => {
    const migrations: CloudMigration[] = [
      { name: '0002_second.sql', sql: 'BEGIN; SELECT 2; COMMIT;' },
      { name: '0001_first.sql', sql: 'SELECT 1;' },
    ];
    const { pool, calls, client } = createPool();

    await expect(runCloudMigrations(pool, migrations)).resolves.toEqual({
      applied: ['0001_first.sql', '0002_second.sql'],
      skipped: [],
    });

    const statements = calls.map((call) => call.sql.trim());
    expect(statements[0]).toContain('pg_advisory_lock');
    expect(statements).toContain('BEGIN');
    expect(statements).toContain('SELECT 2;');
    expect(statements).toContain('COMMIT');
    expect(statements.at(-1)).toContain('pg_advisory_unlock');
    expect(client.release).toHaveBeenCalledOnce();
  });

  it('skips matching migrations and rejects checksum drift', async () => {
    const migration = { name: '0001_first.sql', sql: 'SELECT 1;' };
    const { pool } = createPool({
      '0001_first.sql': 'a'.repeat(64),
    });

    await expect(runCloudMigrations(pool, [migration])).rejects.toThrow(
      'Applied cloud migration was modified'
    );
  });

  it('rejects invalid or duplicate migration names before opening a connection', async () => {
    const connect = vi.fn();
    const pool = { connect };

    await expect(
      runCloudMigrations(pool, [{ name: '../bad.sql', sql: 'SELECT 1;' }])
    ).rejects.toThrow('Invalid cloud migration filename');
    await expect(
      runCloudMigrations(pool, [
        { name: '0001_first.sql', sql: 'SELECT 1;' },
        { name: '0001_first.sql', sql: 'SELECT 2;' },
      ])
    ).rejects.toThrow('Duplicate cloud migration filename');
    expect(connect).not.toHaveBeenCalled();
  });
});
