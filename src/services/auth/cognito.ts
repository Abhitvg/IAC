export interface CognitoAuthConfig {
  domain: string;
  clientId: string;
  redirectUri: string;
  logoutUri: string;
  scopes?: string[];
}

interface TokenResponse {
  access_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
  error?: string;
}

interface PendingAuth {
  state: string;
  verifier: string;
  nonce: string;
}

let accessToken: string | null = null;
let accessTokenExpiresAt = 0;

function randomBase64Url(byteLength = 32): string {
  const bytes = crypto.getRandomValues(new Uint8Array(byteLength));
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

async function sha256Base64Url(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value));
  let binary = '';
  for (const byte of new Uint8Array(digest)) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  const payload = token.split('.')[1];
  if (!payload) throw new Error('Invalid identity token');
  const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
  const decoded = JSON.parse(atob(normalized)) as unknown;
  if (!decoded || typeof decoded !== 'object' || Array.isArray(decoded)) {
    throw new Error('Invalid identity token');
  }
  return decoded as Record<string, unknown>;
}

function normalizeHttpsUrl(value: string, label: string): URL {
  const url = new URL(value);
  if (url.protocol !== 'https:' && url.hostname !== 'localhost') {
    throw new Error(`${label} must use HTTPS`);
  }
  if (url.username || url.password || url.hash) throw new Error(`${label} is invalid`);
  return url;
}

export class CognitoAuthClient {
  private readonly domain: URL;
  private readonly redirectUri: string;
  private readonly logoutUri: string;
  private readonly scopes: string[];

  constructor(private readonly config: CognitoAuthConfig) {
    this.domain = normalizeHttpsUrl(config.domain, 'Cognito domain');
    this.redirectUri = normalizeHttpsUrl(config.redirectUri, 'Cognito callback URL').toString();
    this.logoutUri = normalizeHttpsUrl(config.logoutUri, 'Cognito logout URL').toString();
    if (!config.clientId.trim()) throw new Error('Cognito app client ID is required');
    this.scopes = config.scopes ?? ['openid', 'email', 'profile'];
    if (!this.scopes.includes('openid')) throw new Error('Cognito OIDC scopes must include openid');
  }

  async signIn(): Promise<void> {
    const verifier = randomBase64Url(64);
    const pending: PendingAuth = {
      state: randomBase64Url(),
      verifier,
      nonce: randomBase64Url(),
    };
    sessionStorage.setItem('careerops.cognito.pending', JSON.stringify(pending));
    const challenge = await sha256Base64Url(verifier);
    const url = new URL('/oauth2/authorize', this.domain);
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      response_type: 'code',
      scope: this.scopes.join(' '),
      redirect_uri: this.redirectUri,
      state: pending.state,
      nonce: pending.nonce,
      code_challenge: challenge,
      code_challenge_method: 'S256',
    }).toString();
    window.location.assign(url.toString());
  }

  async completeCallback(callbackUrl = window.location.href): Promise<void> {
    const url = new URL(callbackUrl);
    const oauthError = url.searchParams.get('error');
    if (oauthError) throw new Error('Cognito sign-in was not completed');
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const rawPending = sessionStorage.getItem('careerops.cognito.pending');
    sessionStorage.removeItem('careerops.cognito.pending');
    if (!code || !state || !rawPending) throw new Error('Missing Cognito authorization response');
    const pending = JSON.parse(rawPending) as PendingAuth;
    if (!pending.state || state !== pending.state || !pending.verifier || !pending.nonce) {
      throw new Error('Cognito authorization state validation failed');
    }

    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.config.clientId,
      code,
      redirect_uri: this.redirectUri,
      code_verifier: pending.verifier,
    });
    const response = await fetch(new URL('/oauth2/token', this.domain), {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body,
      credentials: 'omit',
      redirect: 'error',
      cache: 'no-store',
    });
    const tokens = (await response.json().catch(() => ({}))) as TokenResponse;
    if (
      !response.ok ||
      !tokens.access_token ||
      !tokens.id_token ||
      tokens.token_type?.toLowerCase() !== 'bearer'
    ) {
      throw new Error('Cognito token exchange failed');
    }
    const idClaims = decodeJwtPayload(tokens.id_token);
    if (
      idClaims.nonce !== pending.nonce ||
      idClaims.iss !== this.configIssuer ||
      idClaims.aud !== this.config.clientId
    ) {
      throw new Error('Cognito identity token validation failed');
    }
    accessToken = tokens.access_token;
    accessTokenExpiresAt = Date.now() + Math.max(60, tokens.expires_in ?? 3600) * 1000;
    window.history.replaceState({}, document.title, url.pathname);
  }

  private get configIssuer(): string {
    return import.meta.env.VITE_COGNITO_ISSUER;
  }

  async getAccessToken(): Promise<string | null> {
    if (accessToken && Date.now() < accessTokenExpiresAt - 30_000) return accessToken;
    accessToken = null;
    accessTokenExpiresAt = 0;
    return null;
  }

  signOut(): void {
    accessToken = null;
    accessTokenExpiresAt = 0;
    sessionStorage.removeItem('careerops.cognito.pending');
    const url = new URL('/logout', this.domain);
    url.search = new URLSearchParams({
      client_id: this.config.clientId,
      logout_uri: this.logoutUri,
    }).toString();
    window.location.assign(url.toString());
  }
}

let singleton: CognitoAuthClient | null = null;

export function getCognitoAuthClient(): CognitoAuthClient | null {
  const env = import.meta.env;
  const required = [
    env.VITE_COGNITO_DOMAIN,
    env.VITE_COGNITO_CLIENT_ID,
    env.VITE_COGNITO_ISSUER,
    env.VITE_COGNITO_REDIRECT_URI,
    env.VITE_COGNITO_LOGOUT_URI,
  ];
  if (required.some((value) => typeof value !== 'string' || value.length === 0)) return null;
  singleton ??= new CognitoAuthClient({
    domain: env.VITE_COGNITO_DOMAIN,
    clientId: env.VITE_COGNITO_CLIENT_ID,
    redirectUri: env.VITE_COGNITO_REDIRECT_URI,
    logoutUri: env.VITE_COGNITO_LOGOUT_URI,
  });
  return singleton;
}
