import { createPostgresPool } from './postgres-pool';
import { loadCloudEnvironment } from './config';
import { createCloudApiRuntime } from './runtime';

function readPort(value: string | undefined): number {
  const port = Number(value ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

async function start(): Promise<void> {
  const environment = loadCloudEnvironment();
  const pool = createPostgresPool(environment);
  pool.on('error', (error: Error) => {
    // Never log connection strings, query parameters, or SQL values.
    console.error('CareerOps PostgreSQL idle-client error:', error.message);
  });

  const runtime = createCloudApiRuntime(pool, environment);
  const port = readPort(process.env.PORT);
  const host = process.env.HOST ?? '0.0.0.0';

  let shutdown: Promise<void> | undefined;
  const stop = () => {
    shutdown ??= runtime.close().catch((error: unknown) => {
      console.error(
        'CareerOps API shutdown failed:',
        error instanceof Error ? error.message : 'Unknown shutdown error'
      );
      process.exitCode = 1;
    });
    return shutdown;
  };

  process.once('SIGINT', () => void stop());
  process.once('SIGTERM', () => void stop());

  try {
    await runtime.listen(port, host);
    console.info(`CareerOps API listening on ${host}:${port}`);
  } catch (error) {
    console.error(
      'CareerOps API failed to start:',
      error instanceof Error ? error.message : 'Unknown startup error'
    );
    await stop();
    process.exitCode = 1;
  }
}

void start().catch((error: unknown) => {
  console.error(
    'CareerOps API startup configuration failed:',
    error instanceof Error ? error.message : 'Unknown startup error'
  );
  process.exitCode = 1;
});
