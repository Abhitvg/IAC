/**
 * SSRF and URL Safety Policy
 * Protects local environment and internal infrastructure against Server-Side Request Forgery,
 * cloud metadata exfiltration, loopback probes, and protocol evasion.
 */

export interface UrlValidationResult {
  safe: boolean;
  normalizedUrl?: string;
  reason?: string;
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  '127.0.0.1',
  '0.0.0.0',
  '::1',
  '[::1]',
  'metadata.google.internal',
  '169.254.169.254',
  'instance-data',
]);

function isPrivateOrReservedIp(ip: string): boolean {
  const cleanIp = ip.replace(/^\[|\]$/g, '').toLowerCase();

  // IPv4 Private & Reserved Ranges
  const parts = cleanIp.split('.').map((p) => parseInt(p, 10));
  if (parts.length === 4 && parts.every((p) => !isNaN(p) && p >= 0 && p <= 255)) {
    if (parts[0] === 127) return true; // Loopback
    if (parts[0] === 10) return true; // Class A Private
    if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true; // Class B Private
    if (parts[0] === 192 && parts[1] === 168) return true; // Class C Private
    if (parts[0] === 169 && parts[1] === 254) return true; // Link-Local / Metadata
    if (parts[0] === 0) return true; // Broadcast / Zero
  }

  // IPv6 Loopback & Link-local checks
  if (cleanIp === '::1' || cleanIp === '::' || cleanIp.startsWith('fe80:') || cleanIp.startsWith('fc00:') || cleanIp.startsWith('fd00:')) {
    return true;
  }

  return false;
}

export function validateAndNormalizeUrl(rawUrl: string, allowedOrigin?: string): UrlValidationResult {
  if (!rawUrl || !rawUrl.trim()) {
    return { safe: false, reason: 'Empty or blank URL provided.' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { safe: false, reason: 'Malformed URL structure.' };
  }

  // 1. Protocol allowlist: HTTP and HTTPS only
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return { safe: false, reason: `Disallowed protocol scheme: ${parsed.protocol} (only http: and https: allowed)` };
  }

  const hostname = parsed.hostname.toLowerCase();

  // 2. Reject blocked hostnames
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return { safe: false, reason: `Blocked private or cloud metadata hostname: ${hostname}` };
  }

  // 3. Reject direct private/reserved IP access
  if (isPrivateOrReservedIp(hostname)) {
    return { safe: false, reason: `Blocked private or link-local IP range: ${hostname}` };
  }

  // 4. Same-origin constraint (if crawling under a specified origin)
  if (allowedOrigin) {
    try {
      const allowed = new URL(allowedOrigin);
      if (parsed.hostname.toLowerCase() !== allowed.hostname.toLowerCase()) {
        return { safe: false, reason: `Cross-origin crawling blocked: target ${parsed.hostname} does not match allowed origin ${allowed.hostname}` };
      }
    } catch {}
  }

  // 5. Normalize: Strip hash fragments and tracking query params (utm_*, ref, fbclid)
  const cleanParams = new URLSearchParams();
  for (const [key, value] of parsed.searchParams.entries()) {
    if (!key.startsWith('utm_') && key !== 'ref' && key !== 'fbclid' && key !== 'gclid') {
      cleanParams.append(key, value);
    }
  }

  parsed.search = cleanParams.toString() ? `?${cleanParams.toString()}` : '';
  parsed.hash = '';

  return {
    safe: true,
    normalizedUrl: parsed.toString(),
  };
}
