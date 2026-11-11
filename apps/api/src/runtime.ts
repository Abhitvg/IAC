import type { Server } from 'node:http';
import { loadCloudEnvironment, type CloudEnvironment } from './config';
import { createOidcIdentityVerifier } from './identity';
import { PostgresCloudApiRepository, type ClosableSqlPool } from './postgres-repository';
import { PostgresCloudRateLimiter } from './postgres-rate-limiter';
import { createCloudApiServer } from './server';
import { PostgresCareerGraphRepository } from './career-graph-repository';
import type { CareerGraphEnvelopeVerifier } from './ports';

export interface CloudApiRuntime {
  server: Server;
  listen(port: number, host?: string): Promise<void>;
  close(): Promise<void>;
}

export function createCloudApiRuntime(
  pool: ClosableSqlPool,
  environment: CloudEnvironment = loadCloudEnvironment(),
  careerGraphEnvelopeVerifier?: CareerGraphEnvelopeVerifier
): CloudApiRuntime {
  const repository = new PostgresCloudApiRepository(pool);
  const server = createCloudApiServer({
    identityVerifier: createOidcIdentityVerifier({
      issuer: environment.CAREEROPS_JWT_ISSUER,
      audience: environment.CAREEROPS_JWT_AUDIENCE,
      jwksUrl: environment.CAREEROPS_JWKS_URL,
    }),
    repository,
    careerGraph: new PostgresCareerGraphRepository(pool),
    // No hosted fact writes until a real tenant-scoped cloud KMS verifier is configured.
    careerGraphEnvelopeVerifier:
      careerGraphEnvelopeVerifier ?? {
        verify: async () => {
          throw new Error('Career Graph KMS provider is not configured');
        },
      },
    rateLimiter: new PostgresCloudRateLimiter(
      pool,
      environment.CAREEROPS_RATE_LIMIT_HASH_SECRET
    ),
    config: {
      issuer: environment.CAREEROPS_JWT_ISSUER,
      audience: environment.CAREEROPS_JWT_AUDIENCE,
      jwksUrl: environment.CAREEROPS_JWKS_URL,
      consentSigningSecret: environment.CAREEROPS_CONSENT_SIGNING_SECRET,
      maxRequestBytes: environment.CAREEROPS_MAX_REQUEST_BYTES,
    },
  });

  let closed = false;
  return {
    server,
    listen(port, host = '0.0.0.0') {
      if (closed) throw new Error('Cloud API runtime is already closed');
      if (!Number.isInteger(port) || port < 0 || port > 65535 || !host.trim()) {
        throw new Error('Invalid API listen address');
      }
      return new Promise((resolve, reject) => {
        const onError = (error: Error) => reject(error);
        server.once('error', onError);
        server.listen(port, host, () => {
          server.off('error', onError);
          resolve();
        });
      });
    },
    async close() {
      if (closed) return;
      closed = true;
      try {
        if (server.listening) {
          await new Promise<void>((resolve, reject) => {
            server.close((error) => (error ? reject(error) : resolve()));
          });
        }
      } finally {
        await pool.end();
      }
    },
  };
}
