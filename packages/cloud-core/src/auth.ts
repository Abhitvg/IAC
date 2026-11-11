import { createHmac, timingSafeEqual } from 'node:crypto';

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

function decodeSegment(segment: string): Record<string, unknown> {
  const value = JSON.parse(Buffer.from(segment, 'base64url').toString('utf8')) as unknown;
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
  const actual = Buffer.from(segments[2], 'base64url');
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
