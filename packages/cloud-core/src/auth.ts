import {
  createHmac,
  createPublicKey,
  timingSafeEqual,
  verify as verifySignature,
} from 'node:crypto';

export interface VerifiedIdentity {
  subject: string;
  issuer: string;
  audience: string[];
  expiresAt: number;
}

export interface JwtVerificationConfig {
  issuer: string;
  audience: string;
  hmacSecret: string;
  clockToleranceSeconds?: number;
}

function decodeBase64UrlSegment(segment: string): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(segment)) {
    throw new Error('Malformed base64url segment');
  }
  const decoded = Buffer.from(segment, 'base64url');
  if (decoded.toString('base64url') !== segment) {
    throw new Error('Non-canonical base64url segment');
  }
  return decoded;
}

function decodeSegment(segment: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(decodeBase64UrlSegment(segment).toString('utf8')) as unknown;
  } catch {
    throw new Error('Malformed token segment');
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('Malformed token segment');
  }
  return value as Record<string, unknown>;
}

export function verifyAccessToken(
  token: string,
  config: JwtVerificationConfig,
  nowSeconds = Math.floor(Date.now() / 1000)
): VerifiedIdentity {
  if (!config.hmacSecret || config.hmacSecret.length < 32) {
    throw new Error('Authentication signing secret must contain at least 32 characters');
  }
  if (typeof token !== 'string' || token.length > 8192) {
    throw new Error('Invalid access token');
  }

  const segments = token.split('.');
  if (segments.length !== 3 || segments.some((part) => !part)) {
    throw new Error('Malformed access token');
  }

  const header = decodeSegment(segments[0]);
  const claims = decodeSegment(segments[1]);
  if (header.alg !== 'HS256' || header.typ !== 'JWT') {
    throw new Error('Unsupported access token algorithm or type');
  }

  const expected = createHmac('sha256', config.hmacSecret)
    .update(segments.slice(0, 2).join('.'))
    .digest();
  const actual = decodeBase64UrlSegment(segments[2]);
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) {
    throw new Error('Invalid access token signature');
  }

  const tolerance = config.clockToleranceSeconds ?? 30;
  const exp = claims.exp;
  const nbf = claims.nbf;
  const iat = claims.iat;
  if (
    typeof claims.sub !== 'string' ||
    claims.sub.length < 1 ||
    claims.sub.length > 255 ||
    claims.iss !== config.issuer ||
    !Number.isInteger(exp) ||
    (exp as number) <= nowSeconds - tolerance ||
    (nbf !== undefined && (typeof nbf !== 'number' || nbf > nowSeconds + tolerance)) ||
    (iat !== undefined && (typeof iat !== 'number' || iat > nowSeconds + tolerance))
  ) {
    throw new Error('Access token claims are invalid or expired');
  }

  const audience = Array.isArray(claims.aud)
    ? claims.aud.filter((value): value is string => typeof value === 'string')
    : typeof claims.aud === 'string'
      ? [claims.aud]
      : [];
  if (!audience.includes(config.audience)) {
    throw new Error('Access token audience is invalid');
  }

  return {
    subject: claims.sub,
    issuer: config.issuer,
    audience,
    expiresAt: exp as number,
  };
}

export function readBearerToken(header: string | undefined): string {
  if (!header || !/^Bearer [A-Za-z0-9._~-]+$/.test(header)) {
    throw new Error('Bearer access token required');
  }
  return header.slice(7);
}

export interface OidcJwksConfig {
  issuer: string;
  audience: string;
  jwksUrl: string;
  clockToleranceSeconds?: number;
  cacheTtlMs?: number;
}

interface JsonWebKeySet {
  keys: Array<JsonWebKey & { kid?: string; alg?: string; use?: string; key_ops?: string[] }>;
}

export class OidcJwksVerifier {
  private cachedKeys: JsonWebKeySet | null = null;
  private cacheExpiresAt = 0;
  private lastJwksFetchAt = 0;
  private readonly jwksUrl: URL;

  constructor(
    private readonly config: OidcJwksConfig,
    private readonly fetcher: typeof fetch = fetch
  ) {
    const url = new URL(config.jwksUrl);
    if (url.protocol !== 'https:' || url.username || url.password || url.hash) {
      throw new Error('OIDC JWKS URL must be a clean HTTPS URL');
    }
    const issuer = new URL(config.issuer);
    if (issuer.protocol !== 'https:') throw new Error('OIDC issuer must use HTTPS');
    this.jwksUrl = url;
  }

  async verify(
    token: string,
    nowSeconds = Math.floor(Date.now() / 1000)
  ): Promise<VerifiedIdentity> {
    if (typeof token !== 'string' || token.length > 8192) throw new Error('Invalid access token');
    const segments = token.split('.');
    if (segments.length !== 3 || segments.some((part) => !part))
      throw new Error('Malformed access token');
    const header = decodeSegment(segments[0]);
    const claims = decodeSegment(segments[1]);
    if (
      header.alg !== 'RS256' ||
      header.typ !== 'JWT' ||
      typeof header.kid !== 'string' ||
      header.kid.length < 1 ||
      header.kid.length > 200 ||
      header.crit !== undefined
    )
      throw new Error('Unsupported OIDC access token header');

    let jwk = await this.findSigningKey(header.kid);
    if (!jwk && Date.now() - this.lastJwksFetchAt >= 30_000) {
      jwk = await this.findSigningKey(header.kid, true);
    }
    if (
      !jwk ||
      jwk.kty !== 'RSA' ||
      (jwk.use && jwk.use !== 'sig') ||
      (jwk.alg && jwk.alg !== 'RS256') ||
      (jwk.key_ops && !jwk.key_ops.includes('verify'))
    ) {
      throw new Error('No valid OIDC signing key found');
    }

    const publicKey = createPublicKey({ key: jwk, format: 'jwk' });
    if (
      publicKey.asymmetricKeyType !== 'rsa' ||
      (publicKey.asymmetricKeyDetails?.modulusLength ?? 0) < 2048
    ) {
      throw new Error('OIDC signing key must be RSA-2048 or stronger');
    }
    const signature = decodeBase64UrlSegment(segments[2]);
    const valid = verifySignature(
      'RSA-SHA256',
      Buffer.from(segments.slice(0, 2).join('.')),
      publicKey,
      signature
    );
    if (!valid) throw new Error('Invalid access token signature');

    const tolerance = this.config.clockToleranceSeconds ?? 30;
    const exp = claims.exp;
    const nbf = claims.nbf;
    const iat = claims.iat;
    if (
      typeof claims.sub !== 'string' ||
      claims.sub.length < 1 ||
      claims.sub.length > 255 ||
      claims.iss !== this.config.issuer ||
      !Number.isInteger(exp) ||
      (exp as number) <= nowSeconds - tolerance ||
      (nbf !== undefined && (!Number.isInteger(nbf) || (nbf as number) > nowSeconds + tolerance)) ||
      (iat !== undefined && (!Number.isInteger(iat) || (iat as number) > nowSeconds + tolerance))
    )
      throw new Error('Access token claims are invalid or expired');

    const audience =
      typeof claims.aud === 'string'
        ? [claims.aud]
        : Array.isArray(claims.aud) &&
            claims.aud.length > 0 &&
            claims.aud.every((value) => typeof value === 'string')
          ? (claims.aud as string[])
          : [];
    if (
      !audience.includes(this.config.audience) ||
      (audience.length > 1 && claims.azp !== this.config.audience) ||
      (claims.azp !== undefined && claims.azp !== this.config.audience)
    ) {
      throw new Error('Access token audience or authorized party is invalid');
    }

    return { subject: claims.sub, issuer: this.config.issuer, audience, expiresAt: exp as number };
  }

  private async findSigningKey(kid: string, forceRefresh = false): Promise<JsonWebKey | undefined> {
    if (forceRefresh || !this.cachedKeys || Date.now() >= this.cacheExpiresAt) {
      const response = await this.fetcher(this.jwksUrl, {
        method: 'GET',
        redirect: 'error',
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok) throw new Error('OIDC signing key endpoint unavailable');
      const declaredLength = Number(response.headers.get('content-length') ?? 0);
      if (declaredLength > 64 * 1024) throw new Error('OIDC signing key response too large');
      const raw = await response.text();
      if (raw.length > 64 * 1024) throw new Error('OIDC signing key response too large');
      const parsed = JSON.parse(raw) as unknown;
      if (
        !parsed ||
        typeof parsed !== 'object' ||
        !Array.isArray((parsed as { keys?: unknown }).keys)
      ) {
        throw new Error('Malformed OIDC signing key set');
      }
      const keys = (parsed as { keys: unknown[] }).keys;
      if (keys.length < 1 || keys.length > 100) throw new Error('Invalid OIDC signing key count');
      this.cachedKeys = { keys: keys as JsonWebKeySet['keys'] };
      this.lastJwksFetchAt = Date.now();
      this.cacheExpiresAt =
        Date.now() + Math.min(Math.max(this.config.cacheTtlMs ?? 300_000, 10_000), 900_000);
    }
    const matches = this.cachedKeys.keys.filter((key) => key.kid === kid);
    if (matches.length > 1) throw new Error('OIDC signing key identifier is ambiguous');
    return matches[0];
  }
}
