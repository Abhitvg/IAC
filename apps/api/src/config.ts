import { z } from 'zod';

const CloudEnvironmentSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']),
    CAREEROPS_JWT_ISSUER: z
      .string()
      .url()
      .refine((value) => value.startsWith('https://'), 'Issuer must use HTTPS'),
    CAREEROPS_JWT_AUDIENCE: z.string().min(3).max(200),
    CAREEROPS_JWKS_URL: z
      .string()
      .url()
      .refine((value) => value.startsWith('https://'), 'JWKS URL must use HTTPS'),
    CAREEROPS_CONSENT_SIGNING_SECRET: z.string().min(32),
    CAREEROPS_RATE_LIMIT_HASH_SECRET: z.string().min(32),
    CAREEROPS_DATABASE_URL: z.string().url().optional(),
    CAREEROPS_DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    CAREEROPS_MAX_REQUEST_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(1024 * 1024)
      .default(16 * 1024),
  })
  .superRefine((values, context) => {
    if (values.CAREEROPS_CONSENT_SIGNING_SECRET === values.CAREEROPS_RATE_LIMIT_HASH_SECRET) {
      context.addIssue({
        code: 'custom',
        path: ['CAREEROPS_RATE_LIMIT_HASH_SECRET'],
        message: 'Rate-limit hash secret must be different from the consent signing secret',
      });
    }
  });

export type CloudEnvironment = z.infer<typeof CloudEnvironmentSchema>;

export function loadCloudEnvironment(
  environment: NodeJS.ProcessEnv = process.env
): CloudEnvironment {
  return CloudEnvironmentSchema.parse(environment);
}
