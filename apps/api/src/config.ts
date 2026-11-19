import { z } from 'zod';

const MASTER_KEY_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const BASE64_PATTERN = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const KMS_KEY_ARN_PATTERN = /^arn:(?:aws|aws-us-gov|aws-cn|aws-iso|aws-iso-b):kms:[a-z0-9-]+:\d{12}:key\/[A-Fa-f0-9-]{36}$/;
const KMS_KEY_VERSION_PATTERN = /^kms-v[1-9][0-9]{0,2}$/;

function isValidEnvelopeMasterKeyRing(raw: string, currentVersion: string): boolean {
  if (!raw) return false;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return false;
    const entries = Object.entries(parsed);
    if (entries.length < 1 || entries.length > 8) return false;
    for (const [version, encodedKey] of entries) {
      if (
        !MASTER_KEY_VERSION_PATTERN.test(version) ||
        typeof encodedKey !== 'string' ||
        !BASE64_PATTERN.test(encodedKey)
      ) {
        return false;
      }
      const decoded = Buffer.from(encodedKey, 'base64');
      const valid = decoded.length === 32 && decoded.toString('base64') === encodedKey;
      decoded.fill(0);
      if (!valid) return false;
    }
    return (
      MASTER_KEY_VERSION_PATTERN.test(currentVersion) &&
      entries.some(([version]) => version === currentVersion)
    );
  } catch {
    return false;
  }
}

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
    CAREEROPS_TRUST_PROXY: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    CAREEROPS_CORS_ALLOWED_ORIGINS: z
      .string()
      .default('')
      .transform((value) =>
        value
          .split(',')
          .map((origin) => origin.trim())
          .filter(Boolean)
      )
      .refine(
        (origins) =>
          origins.every((origin) => {
            try {
              const parsed = new URL(origin);
              return parsed.protocol === 'https:' && parsed.origin === origin;
            } catch {
              return false;
            }
          }),
        'CORS origins must be exact HTTPS origins without paths or trailing slashes'
      ),
    CAREEROPS_DATABASE_URL: z.string().url().optional(),
    CAREEROPS_ENVELOPE_MASTER_KEYS: z.string().max(4096).default(''),
    CAREEROPS_ENVELOPE_CURRENT_KEY_VERSION: z.string().max(64).default('v1'),
    CAREEROPS_KMS_KEY_ARN: z.string().optional(),
    CAREEROPS_KMS_KEY_VERSION: z.string().optional(),
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
    const kmsConfigured = Boolean(values.CAREEROPS_KMS_KEY_ARN || values.CAREEROPS_KMS_KEY_VERSION);
    if (
      kmsConfigured &&
      (!values.CAREEROPS_KMS_KEY_ARN ||
        !KMS_KEY_ARN_PATTERN.test(values.CAREEROPS_KMS_KEY_ARN) ||
        !values.CAREEROPS_KMS_KEY_VERSION ||
        !KMS_KEY_VERSION_PATTERN.test(values.CAREEROPS_KMS_KEY_VERSION))
    ) {
      context.addIssue({
        code: 'custom',
        path: ['CAREEROPS_KMS_KEY_ARN'],
        message: 'KMS envelope encryption requires a canonical key ARN and a kms-vN key version together',
      });
    }
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
    if (
      linkedinConfigured &&
      !isValidEnvelopeMasterKeyRing(
        values.CAREEROPS_ENVELOPE_MASTER_KEYS,
        values.CAREEROPS_ENVELOPE_CURRENT_KEY_VERSION
      )
    ) {
      context.addIssue({
        code: 'custom',
        path: ['CAREEROPS_ENVELOPE_MASTER_KEYS'],
        message:
          'LinkedIn token encryption requires a JSON key ring containing one to eight canonical base64 32-byte keys and the configured current key version',
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

export type CloudEnvironment = Omit<
  z.infer<typeof CloudEnvironmentSchema>,
  'CAREEROPS_CORS_ALLOWED_ORIGINS'
> & {
  CAREEROPS_CORS_ALLOWED_ORIGINS: string[];
};

export function loadCloudEnvironment(
  environment: NodeJS.ProcessEnv = process.env
): CloudEnvironment {
  return CloudEnvironmentSchema.parse(environment);
}

/**
 * The local master-key provider is a migration fallback, not an acceptable
 * production encryption boundary. Until the AWS SDK KMS client is composed
 * into API startup, production must not start with local envelope keys.
 */
export function assertEnvelopeEncryptionRuntimeReady(
  environment: Pick<
    CloudEnvironment,
    'NODE_ENV' | 'CAREEROPS_KMS_KEY_ARN' | 'CAREEROPS_KMS_KEY_VERSION'
  >
): void {
  if (environment.NODE_ENV === 'production') {
    throw new Error(
      'Production API startup is blocked until KMS-backed envelope encryption is wired into the runtime'
    );
  }
  if (environment.CAREEROPS_KMS_KEY_ARN || environment.CAREEROPS_KMS_KEY_VERSION) {
    throw new Error(
      'KMS configuration is present, but the AWS SDK client is not wired into API startup; refusing to fall back to local envelope encryption'
    );
  }
}
