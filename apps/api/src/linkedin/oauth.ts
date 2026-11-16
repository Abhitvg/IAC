import { randomBytes, timingSafeEqual } from 'node:crypto';
import {
  LINKEDIN_MEMBER_WRITE_SCOPE,
  LINKEDIN_OPENID_SCOPES,
  type LinkedInConnectionIdentity,
  type LinkedInOAuthConfig,
  type LinkedInOAuthStateStore,
  type LinkedInTokenSet,
  type LinkedInTokenVault,
} from './types';

const AUTHORIZE_URL = 'https://www.linkedin.com/oauth/v2/authorization';
const TOKEN_URL = 'https://www.linkedin.com/oauth/v2/accessToken';
const DEFAULT_STATE_TTL_MS = 10 * 60 * 1000;

function requiredString(value: string, name: string): string {
  const normalized = value.trim();
  if (!normalized) throw new Error('LinkedIn ' + name + ' is required');
  return normalized;
}

function parseScopes(value: unknown): string[] {
  if (typeof value !== 'string') return [];
  return [
    ...new Set(
      value
        .split(/[\s,]+/)
        .map((scope) => scope.trim())
        .filter(Boolean)
    ),
  ];
}

function safeEqual(left: string, right: string): boolean {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}

export class LinkedInOAuthService {
  private readonly fetcher: typeof fetch;
  private readonly stateTtlMs: number;

  constructor(
    private readonly config: LinkedInOAuthConfig,
    private readonly states: LinkedInOAuthStateStore,
    private readonly tokens: LinkedInTokenVault
  ) {
    requiredString(config.clientId, 'client ID');
    requiredString(config.clientSecret, 'client secret');
    requiredString(config.redirectUri, 'redirect URI');
    const redirect = new URL(config.redirectUri);
    if (redirect.protocol !== 'https:' && redirect.hostname !== 'localhost') {
      throw new Error(
        'LinkedIn OAuth redirect URI must use HTTPS (localhost is allowed for development)'
      );
    }
    this.fetcher = config.fetcher ?? fetch;
    this.stateTtlMs = config.stateTtlMs ?? DEFAULT_STATE_TTL_MS;
    if (
      !Number.isInteger(this.stateTtlMs) ||
      this.stateTtlMs < 60_000 ||
      this.stateTtlMs > 15 * 60_000
    ) {
      throw new Error('LinkedIn OAuth state TTL must be between 1 and 15 minutes');
    }
  }

  async createAuthorizationUrl(
    identity: LinkedInConnectionIdentity,
    requestedScopes: string[] = [...LINKEDIN_OPENID_SCOPES, LINKEDIN_MEMBER_WRITE_SCOPE]
  ): Promise<string> {
    requiredString(identity.tenantId, 'tenant ID');
    requiredString(identity.subject, 'member subject');
    const scopes = [...new Set(requestedScopes.map((scope) => requiredString(scope, 'scope')))];
    if (!scopes.length || scopes.length > 20) {
      throw new Error('Invalid LinkedIn OAuth scope request');
    }

    const state = randomBytes(32).toString('base64url');
    await this.states.save({
      state,
      identity,
      redirectUri: this.config.redirectUri,
      expiresAt: Date.now() + this.stateTtlMs,
    });

    const url = new URL(AUTHORIZE_URL);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('state', state);
    url.searchParams.set('scope', scopes.join(' '));
    return url.toString();
  }

  async completeAuthorization(input: {
    code: string;
    state: string;
    identity: LinkedInConnectionIdentity;
  }): Promise<{ connected: true; scopes: string[]; expiresAt: number }> {
    const code = requiredString(input.code, 'authorization code');
    const state = requiredString(input.state, 'state');
    const stored = await this.states.consume(state, input.identity);
    if (!stored || stored.expiresAt <= Date.now()) {
      throw new Error('LinkedIn OAuth state is invalid, expired, or already used');
    }
    this.assertStoredState(stored, input.identity);
    return this.exchangeAuthorizationCode(code, input.identity);
  }

  /**
   * Completes the public LinkedIn redirect. The state is a high-entropy,
   * one-time credential bound to the tenant/member when it was created.
   * No tenant ID or access token is accepted from the browser callback.
   */
  async completeAuthorizationCallback(input: {
    code: string;
    state: string;
  }): Promise<{ connected: true; scopes: string[]; expiresAt: number }> {
    const code = requiredString(input.code, 'authorization code');
    const state = requiredString(input.state, 'state');
    const stored = await this.states.consumeCallback(state);
    if (!stored || stored.expiresAt <= Date.now()) {
      throw new Error('LinkedIn OAuth state is invalid, expired, or already used');
    }
    this.assertStoredState(stored, stored.identity);
    return this.exchangeAuthorizationCode(code, stored.identity);
  }

  async cancelAuthorizationCallback(state: string): Promise<boolean> {
    const normalized = requiredString(state, 'state');
    const stored = await this.states.consumeCallback(normalized);
    return Boolean(stored && stored.expiresAt > Date.now());
  }

  private assertStoredState(
    stored: { identity: LinkedInConnectionIdentity; redirectUri: string },
    expected: LinkedInConnectionIdentity
  ): void {
    if (
      !safeEqual(stored.identity.tenantId, expected.tenantId) ||
      !safeEqual(stored.identity.subject, expected.subject) ||
      stored.redirectUri !== this.config.redirectUri
    ) {
      throw new Error('LinkedIn OAuth state does not match the authenticated member');
    }
  }

  private async exchangeAuthorizationCode(
    code: string,
    identity: LinkedInConnectionIdentity
  ): Promise<{ connected: true; scopes: string[]; expiresAt: number }> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      client_id: this.config.clientId,
      client_secret: this.config.clientSecret,
      redirect_uri: this.config.redirectUri,
    });
    const response = await this.fetcher(TOKEN_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok) {
      // Never include the response body: OAuth errors can echo sensitive request data.
      throw new Error('LinkedIn token exchange failed with HTTP ' + response.status);
    }

    const payload = (await response.json()) as Record<string, unknown>;
    const accessToken = typeof payload.access_token === 'string' ? payload.access_token : '';
    const expiresIn = Number(payload.expires_in);
    if (
      !accessToken ||
      accessToken.length > 4096 ||
      !Number.isFinite(expiresIn) ||
      expiresIn <= 0
    ) {
      throw new Error('LinkedIn returned an invalid token response');
    }

    const grantedScopes = parseScopes(payload.scope);
    if (!grantedScopes.length || !grantedScopes.includes('openid')) {
      throw new Error(
        'LinkedIn did not grant the required OpenID Connect scope; connection was not stored'
      );
    }

    const identityResponse = await this.fetcher('https://api.linkedin.com/v2/userinfo', {
      method: 'GET',
      headers: { authorization: 'Bearer ' + accessToken },
      signal: AbortSignal.timeout(10_000),
    });
    if (!identityResponse.ok) {
      throw new Error('LinkedIn identity verification failed with HTTP ' + identityResponse.status);
    }
    const identityPayload = (await identityResponse.json()) as Record<string, unknown>;
    const memberId = typeof identityPayload.sub === 'string' ? identityPayload.sub.trim() : '';
    if (!memberId || memberId.length > 255 || !/^[A-Za-z0-9_-]+$/.test(memberId)) {
      throw new Error('LinkedIn returned an invalid member identifier');
    }

    const refreshToken =
      typeof payload.refresh_token === 'string' ? payload.refresh_token : undefined;
    const refreshExpiresIn = Number(payload.refresh_token_expires_in);
    const tokenSet: LinkedInTokenSet = {
      accessToken,
      memberId,
      expiresAt: Date.now() + expiresIn * 1000,
      grantedScopes,
      tokenType: 'Bearer',
      ...(refreshToken ? { refreshToken } : {}),
      ...(refreshToken && Number.isFinite(refreshExpiresIn) && refreshExpiresIn > 0
        ? { refreshTokenExpiresAt: Date.now() + refreshExpiresIn * 1000 }
        : {}),
    };
    await this.tokens.put(identity, tokenSet);
    return { connected: true, scopes: grantedScopes, expiresAt: tokenSet.expiresAt };
  }

  async disconnect(identity: LinkedInConnectionIdentity): Promise<void> {
    await this.tokens.delete(identity);
  }
}
