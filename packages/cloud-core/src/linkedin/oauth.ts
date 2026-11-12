import { z } from 'zod';
import { HardLineH1ViolationError } from '../apply/assist-queue';

export const LINKEDIN_OFFICIAL_OAUTH_SCOPES = [
  'openid',
  'profile',
  'email',
] as const;

export const LinkedInOAuthTokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    expires_in: z.number().int().positive(),
    id_token: z.string().optional(),
    scope: z.string().optional(),
    token_type: z.literal('Bearer').default('Bearer'),
  })
  .strict();

export type LinkedInOAuthTokenResponse = z.infer<typeof LinkedInOAuthTokenResponseSchema>;

export interface LinkedInBasicProfile {
  sub: string;
  name: string;
  given_name?: string;
  family_name?: string;
  email: string;
  picture?: string;
}

const FORBIDDEN_COOKIE_OR_CREDENTIAL_KEYS = [
  'li_at',
  'jsessionid',
  'liap',
  'bcookie',
  'bscookie',
  'password',
  'session_cookie',
  'cookie',
  'cookies',
  'credentials',
];

export class LinkedInSecurityGate {
  /**
   * Code-level enforcement of Hard Line H1:
   * Rejects any payload containing LinkedIn passwords, session cookies (li_at, JSESSIONID), or scrapers.
   */
  public static assertNoForbiddenCredentials(payload: Record<string, unknown>): void {
    const serialized = JSON.stringify(payload).toLowerCase();
    for (const forbiddenKey of FORBIDDEN_COOKIE_OR_CREDENTIAL_KEYS) {
      if (
        payload[forbiddenKey] !== undefined ||
        serialized.includes(`"${forbiddenKey}"`) ||
        serialized.includes(`${forbiddenKey}=`)
      ) {
        throw new HardLineH1ViolationError(
          `Hard Line H1 Violation: Storing or receiving LinkedIn passwords or session cookies (${forbiddenKey}) is strictly prohibited. Use official OAuth Sign-In or user-exported data only.`
        );
      }
    }
  }

  /**
   * Validates official LinkedIn OAuth Token Response.
   */
  public static validateOAuthResponse(raw: unknown): LinkedInOAuthTokenResponse {
    if (raw && typeof raw === 'object') {
      LinkedInSecurityGate.assertNoForbiddenCredentials(raw as Record<string, unknown>);
    }
    return LinkedInOAuthTokenResponseSchema.parse(raw);
  }
}

