import { isIP } from 'node:net';
import { Pool, type PoolConfig } from 'pg';
import type { CloudEnvironment } from './config';

const TLS_OVERRIDE_PARAMETERS = ['sslmode', 'sslcert', 'sslkey', 'sslrootcert'];

function isLoopbackHost(hostname: string): boolean {
  if (hostname.toLowerCase() === 'localhost') return true;
  const address = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname;
  const version = isIP(address);
  return (version === 4 && address.startsWith('127.')) || (version === 6 && address === '::1');
}

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

  const loopback = isLoopbackHost(parsed.hostname);
  if (nodeEnvironment !== 'production' && !loopback) {
    throw new Error(
      'Non-production PostgreSQL connections are restricted to loopback hosts; remote databases require NODE_ENV=production'
    );
  }

  const config: PoolConfig = {
    connectionString,
    max,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: false,
    ssl: loopback && nodeEnvironment !== 'production' ? false : { rejectUnauthorized: true },
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
