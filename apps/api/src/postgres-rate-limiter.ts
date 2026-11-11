import { createHmac } from 'node:crypto';
import type { CloudRateLimiter } from './ports';
import type { SqlPool } from './postgres-repository';

const CLEANUP_INTERVAL = 128;

export class PostgresCloudRateLimiter implements CloudRateLimiter {
  private operations = 0;

  constructor(
    private readonly pool: SqlPool,
    private readonly hashSecret: string,
    private readonly now: () => number = Date.now
  ) {
    if (hashSecret.length < 32) {
      throw new Error('Rate-limit hash secret must contain at least 32 characters');
    }
  }

  async consume(key: string, limit: number, windowMs: number): Promise<boolean> {
    if (!key || !Number.isSafeInteger(limit) || limit < 1 ||
        !Number.isSafeInteger(windowMs) || windowMs < 1) {
      throw new Error('Invalid rate-limit key, limit, or window');
    }

    const windowStartMs = Math.floor(this.now() / windowMs) * windowMs;
    const windowStartedAt = new Date(windowStartMs);
    const expiresAt = new Date(windowStartMs + windowMs * 2);
    const bucketKey = createHmac('sha256', this.hashSecret)
      .update(JSON.stringify([key, windowMs]))
      .digest('hex');

    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const result = await client.query<{ request_count: number | string }>(
        `INSERT INTO api_rate_limit_buckets
           (bucket_key, window_started_at, request_count, expires_at)
         VALUES ($1, $2, 1, $3)
         ON CONFLICT (bucket_key) DO UPDATE
           SET request_count = CASE
                 WHEN api_rate_limit_buckets.window_started_at = EXCLUDED.window_started_at
                   THEN api_rate_limit_buckets.request_count + 1
                 ELSE 1
               END,
               window_started_at = EXCLUDED.window_started_at,
               expires_at = EXCLUDED.expires_at
         RETURNING request_count`,
        [bucketKey, windowStartedAt, expiresAt]
      );
      const count = Number(result.rows[0]?.request_count);
      if (!Number.isSafeInteger(count) || count < 1) {
        throw new Error('Rate-limit bucket returned an invalid request count');
      }

      this.operations += 1;
      if (this.operations % CLEANUP_INTERVAL === 0) {
        await client.query('DELETE FROM api_rate_limit_buckets WHERE expires_at <= $1', [
          new Date(this.now()),
        ]);
      }
      await client.query('COMMIT');
      return count <= limit;
    } catch (error) {
      try {
        await client.query('ROLLBACK');
      } catch {
        // Preserve the original database error.
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
