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
    LINKEDIN_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    LINKEDIN_CLIENT_ID: z.string().trim().min(1).max(512).optional(),
    LINKEDIN_CLIENT_SECRET: z.string().trim().min(1).max(4096).optional(),
    LINKEDIN_REDIRECT_URI: z.string().url().optional(),
    LINKEDIN_API_VERSION: z
      .string()
      .regex(/^20\d{4}$/)
      .default('202610'),
    LINKEDIN_KMS_KEY_ID: z.string().trim().min(1).max(2048).optional(),
    AWS_REGION: z.string().trim().min(3).max(32).optional(),
    LINKEDIN_COMMUNITY_MANAGEMENT_APPROVED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    LINKEDIN_COMMUNICATIONS_API_APPROVED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    LINKEDIN_INVITATIONS_API_APPROVED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    LINKEDIN_MESSAGES_API_APPROVED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .superRefine((values, context) => {
    const linkedinFields = [
      values.LINKEDIN_CLIENT_ID,
      values.LINKEDIN_CLIENT_SECRET,
      values.LINKEDIN_REDIRECT_URI,
      values.LINKEDIN_KMS_KEY_ID,
      values.AWS_REGION,
    ];
    if (values.LINKEDIN_ENABLED && linkedinFields.some((value) => !value)) {
      context.addIssue({
        code: 'custom',
        path: ['LINKEDIN_ENABLED'],
        message:
          'LinkedIn requires client ID, client secret, HTTPS redirect URI, AWS KMS key ID, and AWS region',
      });
    }
    if (values.LINKEDIN_ENABLED && values.LINKEDIN_REDIRECT_URI) {
      const redirect = new URL(values.LINKEDIN_REDIRECT_URI);
      if (redirect.protocol !== 'https:' && redirect.hostname !== 'localhost') {
        context.addIssue({
          code: 'custom',
          path: ['LINKEDIN_REDIRECT_URI'],
          message: 'LinkedIn redirect URI must use HTTPS (localhost is allowed for development)',
        });
      }
    }
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
