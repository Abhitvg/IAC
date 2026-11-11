import { describe, expect, it } from 'vitest';
import { createPostgresPoolFromUrl } from '../apps/api/src/postgres-pool';

describe('PostgreSQL runtime pool configuration', () => {
  it('rejects missing or invalid runtime environment values', () => {
    expect(() =>
      createPostgresPoolFromUrl(
        'postgres://user:password@db.example.test/careerops',
        undefined as never
      )
    ).toThrow('A valid NODE_ENV is required');
    expect(() =>
      createPostgresPoolFromUrl(
        'postgres://user:password@db.example.test/careerops',
        'staging' as never
      )
    ).toThrow('A valid NODE_ENV is required');
  });

  it('allows plaintext only for loopback development/test databases', async () => {
    for (const environment of ['development', 'test'] as const) {
      const pool = createPostgresPoolFromUrl(
        'postgres://user:password@127.0.0.1:5432/careerops',
        environment
      );
      try {
        expect(pool.options.ssl).toBe(false);
      } finally {
        await pool.end();
      }
    }
    expect(() =>
      createPostgresPoolFromUrl(
        'postgres://user:password@db.example.test:5432/careerops',
        'development'
      )
    ).toThrow('Non-production PostgreSQL connections are restricted to loopback hosts');
    expect(() =>
      createPostgresPoolFromUrl('postgres://user:password@db.example.test/careerops', 'test')
    ).toThrow('Non-production PostgreSQL connections are restricted to loopback hosts');
  });

  it('requires a PostgreSQL URL and rejects connection-string TLS overrides', () => {
    expect(() => createPostgresPoolFromUrl('https://db.example.test', 'development')).toThrow();
    expect(() =>
      createPostgresPoolFromUrl(
        'postgres://user:password@db.example.test:5432/careerops?sslmode=disable',
        'production'
      )
    ).toThrow('without TLS overrides');
  });

  it('enables certificate-verified TLS in production and applies bounded pool settings', async () => {
    const pool = createPostgresPoolFromUrl(
      'postgres://user:password@db.example.test:5432/careerops',
      'production',
      7
    );
    try {
      expect(pool.options.max).toBe(7);
      expect(pool.options.connectionTimeoutMillis).toBe(5_000);
      expect(pool.options.idleTimeoutMillis).toBe(30_000);
      expect(pool.options.ssl).toEqual({ rejectUnauthorized: true });
    } finally {
      await pool.end();
    }
  });

  it('rejects unsafe pool sizes before creating a pool', () => {
    expect(() =>
      createPostgresPoolFromUrl('postgres://user:password@db.example.test/careerops', 'test', 0)
    ).toThrow('between 1 and 50');
    expect(() =>
      createPostgresPoolFromUrl('postgres://user:password@db.example.test/careerops', 'test', 51)
    ).toThrow('between 1 and 50');
  });
});
