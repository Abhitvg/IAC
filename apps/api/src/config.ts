import { z } from 'zod';

const CloudEnvironmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  CAREEROPS_JWT_ISSUER: z.string().url().refine((value) => value.startsWith('https://'), 'Issuer must use HTTPS'),
  CAREEROPS_JWT_AUDIENCE: z.string().min(3).max(200),
  CAREEROPS_JWT_HMAC_SECRET: z.string().min(32),
  CAREEROPS_CONSENT_SIGNING_SECRET: z.string().min(32),
  CAREEROPS_MAX_REQUEST_BYTES: z.coerce.number().int().min(1024).max(1024 * 1024).default(16 * 1024),
});

export type CloudEnvironment = z.infer<typeof CloudEnvironmentSchema>;

export function loadCloudEnvironment(environment: NodeJS.ProcessEnv = process.env): CloudEnvironment {
  return CloudEnvironmentSchema.parse(environment);
}
