import { describe, expect, it } from 'vitest';
import {
  LINKEDIN_OFFICIAL_OAUTH_SCOPES,
  LinkedInSecurityGate,
} from '../packages/cloud-core/src/linkedin/oauth';
import { HardLineH1ViolationError } from '../packages/cloud-core/src/apply/assist-queue';

describe('Milestone M8 - LinkedIn OAuth Security Gate (Hard Line H1)', () => {
  it('strictly rejects any payload containing LinkedIn session cookies or passwords (H1)', () => {
    // Attempting to pass li_at session cookie
    expect(() =>
      LinkedInSecurityGate.assertNoForbiddenCredentials({
        access_token: 'valid_token',
        li_at: 'AQEDARXXXXX',
      })
    ).toThrow(HardLineH1ViolationError);

    // Attempting to pass JSESSIONID
    expect(() =>
      LinkedInSecurityGate.assertNoForbiddenCredentials({
        access_token: 'valid_token',
        JSESSIONID: 'ajax:12345',
      })
    ).toThrow(HardLineH1ViolationError);

    // Attempting to pass user password
    expect(() =>
      LinkedInSecurityGate.assertNoForbiddenCredentials({
        username: 'candidate@example.com',
        password: 'mySecretPassword123',
      })
    ).toThrow(HardLineH1ViolationError);
  });

  it('validates compliant official OAuth token response with basic scopes', () => {
    expect(LINKEDIN_OFFICIAL_OAUTH_SCOPES).toContain('openid');
    expect(LINKEDIN_OFFICIAL_OAUTH_SCOPES).toContain('profile');
    expect(LINKEDIN_OFFICIAL_OAUTH_SCOPES).toContain('email');

    const validOAuth = {
      access_token: 'AQV7_official_oauth_token_xyz',
      expires_in: 5184000,
      token_type: 'Bearer',
      scope: 'openid profile email',
    };

    const validated = LinkedInSecurityGate.validateOAuthResponse(validOAuth);
    expect(validated.access_token).toBe('AQV7_official_oauth_token_xyz');
    expect(validated.token_type).toBe('Bearer');
  });
});

