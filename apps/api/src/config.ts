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
    AWS_REGION: z.string().regex(/^[a-z]{2}(-gov)?-[a-z]+-[0-9]+$/).optional(),
    CAREEROPS_KMS_KEY_ARN: z
      .string()
      .regex(/^arn:(aws|aws-us-gov|aws-cn):kms:[a-z0-9-]+:[0-9]{12}:key[/][A-Za-z0-9-]+$/)
      .optional(),
    LINKEDIN_CLIENT_ID: z.string().default(''),
    LINKEDIN_CLIENT_SECRET: z.string().default(''),
    LINKEDIN_REDIRECT_URI: z.string().default(''),
    CAREEROPS_DB_POOL_MAX: z.coerce.number().int().min(1).max(50).default(10),
    CAREEROPS_MAX_REQUEST_BYTES: z.coerce
      .number()
      .int()
      .min(1024)
      .max(1024 * 1024)
      .default(16 * 1024),
  })
  .superRefine((values, context) => {
    const linkedinValues = [
      values.LINKEDIN_CLIENT_ID,
      values.LINKEDIN_CLIENT_SECRET,
      values.LINKEDIN_REDIRECT_URI,
    ];
    const linkedinConfigured = linkedinValues.some((value) => value.length > 0);
    if (linkedinConfigured && linkedinValues.some((value) => value.length === 0)) {
      context.addIssue({
        code: 'custom',
        path: ['LINKEDIN_CLIENT_ID'],
        message: 'LinkedIn OAuth requires client ID, client secret, and redirect URI together',
      });
    }
    if (linkedinConfigured && (!values.AWS_REGION || !values.CAREEROPS_KMS_KEY_ARN)) {
      context.addIssue({
        code: 'custom',
        path: ['CAREEROPS_KMS_KEY_ARN'],
        message: 'LinkedIn token encryption requires AWS_REGION and CAREEROPS_KMS_KEY_ARN',
      });
    }
    if (values.LINKEDIN_REDIRECT_URI && !values.LINKEDIN_REDIRECT_URI.startsWith('https://')) {
      context.addIssue({
        code: 'custom',
        path: ['LINKEDIN_REDIRECT_URI'],
        message: 'LinkedIn redirect URI must use HTTPS',
      });
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
