import { createPostgresPoolFromUrl } from '../apps/api/src/postgres-pool';
import { PostgresCareerGraphRepository } from '../apps/api/src/career-graph-repository';
import { MasterKeyTenantKeyProvider } from '../packages/cloud-core/src/master-key-provider';
import { TenantEnvelopeCipher } from '../packages/cloud-core/src/encryption';

function required(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function rotate(): Promise<void> {
  const nodeEnvironment = required('NODE_ENV');
  if (nodeEnvironment !== 'production') {
    throw new Error('Career Graph key rotation is restricted to NODE_ENV=production');
  }

  const tenantId = required('CAREEROPS_ROTATION_TENANT_ID');
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      tenantId
    )
  ) {
    throw new Error('CAREEROPS_ROTATION_TENANT_ID must be a UUID');
  }

  const actorSubject = 'system:careerops-key-rotation';
  const targetKeyVersion = required('CAREEROPS_ENVELOPE_CURRENT_KEY_VERSION');
  let keyRingJson = required('CAREEROPS_ENVELOPE_MASTER_KEYS');
  delete process.env.CAREEROPS_ENVELOPE_MASTER_KEYS;

  let provider: MasterKeyTenantKeyProvider | undefined;
  let pool: ReturnType<typeof createPostgresPoolFromUrl> | undefined;
  try {
    const masterKeys = JSON.parse(keyRingJson) as Record<string, string>;
    keyRingJson = '';
    provider = new MasterKeyTenantKeyProvider({ masterKeys, currentKeyVersion: targetKeyVersion });
    for (const version of Object.keys(masterKeys)) masterKeys[version] = '';

    const databaseUrl = required('CAREEROPS_ROTATION_DATABASE_URL');
    const configuredBatchSize = Number(process.env.CAREEROPS_ROTATION_BATCH_SIZE ?? 50);
    if (!Number.isInteger(configuredBatchSize) || configuredBatchSize < 1 || configuredBatchSize > 100) {
      throw new Error('CAREEROPS_ROTATION_BATCH_SIZE must be an integer from 1 to 100');
    }

    pool = createPostgresPoolFromUrl(databaseUrl, 'production', 2);
    const repository = new PostgresCareerGraphRepository(pool);
    const cipher = new TenantEnvelopeCipher(provider);
    let totalRotated = 0;
    let hasMore = true;

    while (hasMore) {
      const batch = await repository.rotateEnvelopeBatch({
        tenantId,
        actorSubject,
        targetKeyVersion,
        limit: configuredBatchSize,
        reencrypt: (envelope, scopedTenantId, context) =>
          cipher.reencrypt(envelope, scopedTenantId, context),
      });
      totalRotated += batch.rotated;
      hasMore = batch.hasMore;
      console.info(
        JSON.stringify({
          event: 'career_graph_key_rotation_batch',
          tenantId,
          targetKeyVersion,
          rotatedThisBatch: batch.rotated,
          totalRotated,
          hasMore,
        })
      );
    }

    console.info(
      JSON.stringify({
        event: 'career_graph_key_rotation_completed',
        tenantId,
        targetKeyVersion,
        totalRotated,
      })
    );
  } finally {
    keyRingJson = '';
    provider?.destroy();
    await pool?.end();
  }
}

void rotate().catch((error: unknown) => {
  console.error(
    'Career Graph key rotation failed:',
    error instanceof Error ? error.message : 'Unknown rotation error'
  );
  process.exitCode = 1;
});
