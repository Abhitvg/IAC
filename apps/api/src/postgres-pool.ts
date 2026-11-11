import { Pool, type PoolConfig } from 'pg';
import type { CloudEnvironment } from './config';

const TLS_OVERRIDE_PARAMETERS = ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'];

export function createPostgresPoolFromUrl(
  connectionString: string,
  nodeEnvironment: CloudEnvironment['NODE_ENV'],
  max = 10
): Pool {
  if (!['development', 'test', 'production'].includes(nodeEnvironment)) {
    throw new Error('A valid NODE_ENV is required for PostgreSQL connections');
  }
  if (!Number.isInteger(max) || max < 1 || max > 50) {
    throw new Error('PostgreSQL pool max must be an integer between 1 and 50');
  }

  let parsed: URL;
  try {
    parsed = new URL(connectionString);
  } catch {
    throw new Error('A valid PostgreSQL connection URL is required');
  }
  if (
    !['postgres:', 'postgresql:'].includes(parsed.protocol) ||
    !parsed.hostname ||
    TLS_OVERRIDE_PARAMETERS.some((parameter) => parsed.searchParams.has(parameter))
  ) {
    throw new Error('PostgreSQL URL must use postgres:// or postgresql:// without TLS overrides');
  }

  const config: PoolConfig = {
    connectionString,
    max,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: false,
    ssl: nodeEnvironment === 'production' ? { rejectUnauthorized: true } : false,
  };
  return new Pool(config);
}

export function createPostgresPool(environment: CloudEnvironment): Pool {
  if (!environment.CAREEROPS_DATABASE_URL) {
    throw new Error('CAREEROPS_DATABASE_URL is required to start the cloud API');
  }
  return createPostgresPoolFromUrl(
    environment.CAREEROPS_DATABASE_URL,
    environment.NODE_ENV,
    environment.CAREEROPS_DB_POOL_MAX
  );
}
