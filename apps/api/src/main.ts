import { createPostgresPool, createPostgresPoolFromUrl } from './postgres-pool';
import { loadCloudEnvironment } from './config';
import { createCloudApiRuntime } from './runtime';
import { AwsKmsTenantKeyManagementService } from './linkedin/aws-kms';
import { createLinkedInCloudIntegration } from './linkedin/create-integration';

function readPort(value: string | undefined): number {
  const port = Number(value ?? 3000);
  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535');
  }
  return port;
}

async function start(): Promise<void> {
  const environment = loadCloudEnvironment();
  const port = readPort(process.env.PORT);
  const host = process.env.HOST ?? '0.0.0.0';
  const pool = createPostgresPool(environment);
  const schedulerPool = environment.LINKEDIN_SCHEDULER_ENABLED
    ? createPostgresPoolFromUrl(
        environment.CAREEROPS_SCHEDULER_DATABASE_URL!,
        environment.NODE_ENV,
        Math.min(environment.CAREEROPS_DB_POOL_MAX, 5)
      )
    : undefined;
  pool.on('error', (error: Error) => {
    // Never log connection strings, query parameters, or SQL values.
    console.error('CareerOps PostgreSQL idle-client error:', error.message);
  });

  schedulerPool?.on('error', (error: Error) => {
    console.error('CareerOps scheduler PostgreSQL idle-client error:', error.message);
  });

  const linkedin = environment.LINKEDIN_ENABLED
    ? createLinkedInCloudIntegration(
        pool,
        new AwsKmsTenantKeyManagementService({
          region: environment.AWS_REGION!,
          keyId: environment.LINKEDIN_KMS_KEY_ID!,
        }),
        {
          oauth: {
            clientId: environment.LINKEDIN_CLIENT_ID!,
            clientSecret: environment.LINKEDIN_CLIENT_SECRET!,
            redirectUri: environment.LINKEDIN_REDIRECT_URI!,
          },
          apiVersion: environment.LINKEDIN_API_VERSION,
          entitlements: {
            communityManagementApproved: environment.LINKEDIN_COMMUNITY_MANAGEMENT_APPROVED,
            communicationsApiApproved: environment.LINKEDIN_COMMUNICATIONS_API_APPROVED,
            invitationsApiApproved: environment.LINKEDIN_INVITATIONS_API_APPROVED,
            messagesApiApproved: environment.LINKEDIN_MESSAGES_API_APPROVED,
          },
        }
      )
    : undefined;

  const runtime = createCloudApiRuntime(pool, environment, linkedin, schedulerPool);

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
