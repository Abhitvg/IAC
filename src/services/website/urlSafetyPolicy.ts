/**
 * SSRF and URL Safety Policy
 * Hardened security policy protecting local environment, internal networks,
 * and cloud metadata services against Server-Side Request Forgery, DNS rebinding,
 * protocol manipulation, and credential exposure.
 */

export interface UrlValidationResult {
  safe: boolean;
  normalizedUrl?: string;
  resolvedIp?: string;
  ipFamily?: 4 | 6;
  reason?: string;
}

export type DnsResolverFn = (
  hostname: string
) => Promise<Array<{ address: string; family: number }>>;

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'instance-data',
  'metadata.azure.com',
  '169.254.169.254',
  'kubernetes.default.svc',
]);

/**
 * Normalizes and parses various IPv4 integer, hex, octal, or dotted formats into 4 octets.
 */
function parseIpv4ToOctets(ipStr: string): [number, number, number, number] | null {
  const trimmed = ipStr.trim();

  // Pure integer format (e.g. 2130706433 for 127.0.0.1)
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isSafeInteger(num) || num < 0 || num > 0xffffffff) return null;
    return [
      (num >>> 24) & 0xff,
      (num >>> 16) & 0xff,
      (num >>> 8) & 0xff,
      num & 0xff,
    ];
  }

  // Hex format (e.g. 0x7f000001)
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    const num = parseInt(trimmed, 16);
    if (!Number.isSafeInteger(num) || num < 0 || num > 0xffffffff) return null;
    return [
      (num >>> 24) & 0xff,
      (num >>> 16) & 0xff,
      (num >>> 8) & 0xff,
      num & 0xff,
    ];
  }

  const parts = trimmed.split('.');
  if (parts.length !== 4) return null;

  const octets: number[] = [];
  for (const part of parts) {
    let val: number;
    if (/^0x[0-9a-f]+$/i.test(part)) {
      val = parseInt(part, 16);
    } else if (/^0[0-7]+$/.test(part)) {
      val = parseInt(part, 8); // Octal format
    } else if (/^\d+$/.test(part)) {
      val = parseInt(part, 10);
    } else {
      return null;
    }

    if (isNaN(val) || val < 0 || val > 255) return null;
    octets.push(val);
  }

  return octets as [number, number, number, number];
}

/**
 * Checks if an IPv4 address belongs to loopback, private, link-local, carrier NAT, or multicast ranges.
 */
function isPrivateOrReservedIpv4(octets: [number, number, number, number]): boolean {
  const [o1, o2] = octets;

  // Loopback (127.0.0.0/8)
  if (o1 === 127) return true;

  // RFC 1918 Private ranges:
  // 10.0.0.0/8
  if (o1 === 10) return true;
  // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
  // 192.168.0.0/16
  if (o1 === 192 && o2 === 168) return true;

  // Link-local / AWS / GCP / Azure metadata (169.254.0.0/16)
  if (o1 === 169 && o2 === 254) return true;

  // Carrier-grade NAT (100.64.0.0/10: 100.64.0.0 - 100.127.255.255)
  if (o1 === 100 && o2 >= 64 && o2 <= 127) return true;

  // Broadcast / Zero network (0.0.0.0/8)
  if (o1 === 0) return true;

  // Multicast (224.0.0.0/4: 224.0.0.0 - 239.255.255.255)
  if (o1 >= 224 && o1 <= 239) return true;

  // Reserved / Future use (240.0.0.0/4)
  if (o1 >= 240) return true;

  return false;
}

/**
 * Checks if an IPv6 address string belongs to loopback, link-local, unique-local, or IPv4-mapped prohibited ranges.
 */
function isPrivateOrReservedIpv6(ipv6Str: string): boolean {
  let cleaned = ipv6Str.trim().toLowerCase();

  // Strip brackets if present
  if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
    cleaned = cleaned.slice(1, -1);
  }

  // Strip IPv6 zone index (e.g. fe80::1%eth0)
  if (cleaned.includes('%')) {
    cleaned = cleaned.split('%')[0];
  }

  // Loopback (::1)
  if (cleaned === '::1' || cleaned === '0:0:0:0:0:0:0:1') return true;

  // Unspecified (::)
  if (cleaned === '::' || cleaned === '0:0:0:0:0:0:0:0') return true;

  // Link-local unicast (fe80::/10: fe80: to febf:)
  if (/^fe[89ab][0-9a-f]:/i.test(cleaned)) return true;

  // Unique local address (fc00::/7: fc00: to fdff:)
  if (/^f[cd][0-9a-f]{2}:/i.test(cleaned)) return true;

  // Multicast (ff00::/8)
  if (cleaned.startsWith('ff')) return true;

  // Documentation / benchmark (2001:db8::/32, 2001:2::/48)
  if (cleaned.startsWith('2001:db8:') || cleaned.startsWith('2001:2:')) return true;

  // IPv4-mapped IPv6 (::ffff:x.x.x.x or ::ffff:7f00:1)
  const ipv4MappedMatch = cleaned.match(/^(?:::ffff:)?(?:0+:)*ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (ipv4MappedMatch) {
    const octets = parseIpv4ToOctets(ipv4MappedMatch[1]);
    if (octets && isPrivateOrReservedIpv4(octets)) return true;
  }

  // Hexadecimal IPv4-mapped IPv6 (e.g. ::ffff:7f00:0001)
  const hexMappedMatch = cleaned.match(/^(?:::ffff:)?(?:0+:)*ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/i);
  if (hexMappedMatch) {
    const p1 = parseInt(hexMappedMatch[1], 16);
    const p2 = parseInt(hexMappedMatch[2], 16);
    const octets: [number, number, number, number] = [
      (p1 >> 8) & 0xff,
      p1 & 0xff,
      (p2 >> 8) & 0xff,
      p2 & 0xff,
    ];
    if (isPrivateOrReservedIpv4(octets)) return true;
  }

  return false;
}

/**
 * Checks any IP address (IPv4 or IPv6) for private/reserved/internal usage.
 */
export function isPrivateOrReservedIp(ipStr: string): boolean {
  const v4Octets = parseIpv4ToOctets(ipStr);
  if (v4Octets) {
    return isPrivateOrReservedIpv4(v4Octets);
  }

  if (ipStr.includes(':') || ipStr.startsWith('[') || ipStr.includes('%')) {
    return isPrivateOrReservedIpv6(ipStr);
  }

  return false;
}

/**
 * Environment-aware DNS resolver that queries all addresses for a host.
 */
export const defaultDnsResolver: DnsResolverFn = async (hostname: string) => {
  if (typeof window !== 'undefined' && (window as any).electronAPI?.resolveDns) {
    try {
      const addresses = await (window as any).electronAPI.resolveDns(hostname);
      if (Array.isArray(addresses) && addresses.length > 0) {
        return addresses;
      }
    } catch {}
  }

  if (typeof process !== 'undefined' && process.versions?.node) {
    try {
      const dynamicImport = new Function('specifier', 'return import(specifier)');
      const dnsMod = await dynamicImport('node:dns');
      return new Promise((resolve, reject) => {
        dnsMod.lookup(hostname, { all: true }, (err: any, addresses: any) => {
          if (err) return reject(err);
          resolve(addresses as Array<{ address: string; family: number }>);
        });
      });
    } catch {}
  }

  return [];
};

/**
 * Synchronous URL validation against SSRF syntax, private IP literals, protocols, and origin match.
 */
export function validateAndNormalizeUrl(
  rawUrl: string,
  allowedOrigin?: string
): UrlValidationResult {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return { safe: false, reason: 'URL must be a non-empty string' };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl.trim());
  } catch {
    return { safe: false, reason: `Invalid URL format: ${rawUrl}` };
  }

  // 1. Enforce HTTP/HTTPS schemes only
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      safe: false,
      reason: `Blocked unsupported protocol "${parsed.protocol}". Only http: and https: are allowed.`,
    };
  }

  // 2. Reject userinfo credentials (e.g. http://user:pass@example.com)
  if (parsed.username || parsed.password) {
    return {
      safe: false,
      reason: 'URLs containing embedded credentials (userinfo) are prohibited.',
    };
  }

  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  // 3. Reject known dangerous cloud metadata hostnames and loopback names
  if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
    return {
      safe: false,
      reason: `Blocked target hostname: ${hostname} is restricted.`,
    };
  }

  // 4. Validate direct IP literals
  if (isPrivateOrReservedIp(hostname)) {
    return {
      safe: false,
      reason: `Blocked connection to private, loopback, or reserved IP address: ${hostname}`,
    };
  }

  // 5. Origin consistency check (scheme, hostname, port)
  if (allowedOrigin) {
    let allowed: URL;
    try {
      allowed = new URL(allowedOrigin);
    } catch {
      return { safe: false, reason: `Invalid allowedOrigin: ${allowedOrigin}` };
    }

    if (parsed.protocol !== allowed.protocol) {
      return {
        safe: false,
        reason: `Cross-scheme redirect or fetch rejected: expected ${allowed.protocol}, got ${parsed.protocol}`,
      };
    }

    if (parsed.hostname.toLowerCase() !== allowed.hostname.toLowerCase()) {
      return {
        safe: false,
        reason: `Cross-origin request rejected: expected ${allowed.hostname}, got ${parsed.hostname}`,
      };
    }

    const currentPort = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
    const allowedPort = allowed.port || (allowed.protocol === 'https:' ? '443' : '80');
    if (currentPort !== allowedPort) {
      return {
        safe: false,
        reason: `Port mismatch rejected: expected port ${allowedPort}, got ${currentPort}`,
      };
    }
  }

  // 6. Normalize: Strip hash fragments and tracking query params
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

/**
 * Asynchronous URL validation that extends validateAndNormalizeUrl with full DNS resolution
 * and DNS-rebinding protection against internal/prohibited IP addresses.
 */
export async function validateAndNormalizeUrlAsync(
  rawUrl: string,
  allowedOrigin?: string,
  customResolver?: DnsResolverFn
): Promise<UrlValidationResult> {
  const syncCheck = validateAndNormalizeUrl(rawUrl, allowedOrigin);
  if (!syncCheck.safe || !syncCheck.normalizedUrl) {
    return syncCheck;
  }

  const parsed = new URL(syncCheck.normalizedUrl);
  const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

  const resolver = customResolver || defaultDnsResolver;
  let resolvedIp: string | undefined;
  let ipFamily: 4 | 6;

  const isDirectIp = Boolean(parseIpv4ToOctets(hostname) || hostname.includes(':'));
  if (isDirectIp) {
    resolvedIp = hostname;
    ipFamily = hostname.includes(':') ? 6 : 4;
  } else {
    try {
      const addresses = await resolver(hostname);
      if (!addresses || addresses.length === 0) {
        return { safe: false, reason: `DNS resolution returned no addresses for ${hostname}` };
      }

      for (const addr of addresses) {
        if (isPrivateOrReservedIp(addr.address)) {
          return {
            safe: false,
            reason: `DNS resolution for ${hostname} returned prohibited internal IP: ${addr.address}`,
          };
        }
      }

      resolvedIp = addresses[0].address;
      ipFamily = addresses[0].family === 6 ? 6 : 4;
    } catch (err: any) {
      return {
        safe: false,
        reason: `DNS lookup failed for ${hostname}: ${err?.message || 'Resolution error'}`,
      };
    }
  }

  return {
    safe: true,
    normalizedUrl: syncCheck.normalizedUrl,
    resolvedIp,
    ipFamily,
  };
}
