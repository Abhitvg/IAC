/**
 * Safe Connection Fetcher (Electron Main Process / Node)
 *
 * Implements connection-level destination pinning (DNS rebinding protection)
 * by passing a custom lookup function to http.request / https.request.
 * Enforces unified request lifecycle timeouts and streaming size bounds.
 */

import http from 'http';
import https from 'https';
import dns from 'dns';
import { URL } from 'url';

export type PinnedRequester = (params: {
  targetUrl: URL;
  isHttps: boolean;
  pinnedIp: string;
  ipFamily: 4 | 6;
  maxByteSize: number;
  userAgent: string;
  signal: AbortSignal;
}) => Promise<{
  statusCode: number;
  contentType: string;
  location?: string;
  body: string;
  byteSize: number;
}>;

export interface PinnedFetchOptions {
  url: string;
  allowedOrigin?: string;
  timeoutMs?: number;
  maxByteSize?: number;
  maxRedirects?: number;
  customResolver?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
  customRequester?: PinnedRequester;
  userAgent?: string;
  customCa?: string | Buffer | Array<string | Buffer>;
  _testOnlyAllowLoopback?: boolean;
}

export interface PinnedFetchResponse {
  statusCode: number;
  finalUrl: string;
  contentType: string;
  body: string;
  byteSize: number;
  pinnedIp: string;
  redirects: string[];
}

const BLOCKED_HOSTNAMES = new Set([
  'localhost',
  'metadata.google.internal',
  'instance-data',
  'metadata.azure.com',
  '169.254.169.254',
  'kubernetes.default.svc',
]);

function parsePart(part: string): number | null {
  const p = part.trim();
  if (!p) return null;
  if (/^0x[0-9a-f]+$/i.test(p)) {
    const val = parseInt(p, 16);
    return Number.isSafeInteger(val) && val >= 0 ? val : null;
  }
  if (/^0[0-7]+$/.test(p)) {
    const val = parseInt(p, 8);
    return Number.isSafeInteger(val) && val >= 0 ? val : null;
  }
  if (/^\d+$/.test(p)) {
    const val = parseInt(p, 10);
    return Number.isSafeInteger(val) && val >= 0 ? val : null;
  }
  return null;
}

/**
 * Parses any valid IPv4 address representation into 4 octets:
 * Supports 4-part, 3-part, 2-part, single 32-bit integer, decimal, hex, and octal.
 */
export function parseIpv4ToOctets(ipStr: string): [number, number, number, number] | null {
  const trimmed = ipStr.trim();
  if (!trimmed) return null;

  const parts = trimmed.split('.');
  if (parts.length === 1) {
    const val = parsePart(parts[0]);
    if (val === null || val > 0xffffffff) return null;
    return [(val >>> 24) & 0xff, (val >>> 16) & 0xff, (val >>> 8) & 0xff, val & 0xff];
  }
  if (parts.length === 2) {
    const p0 = parsePart(parts[0]);
    const p1 = parsePart(parts[1]);
    if (p0 === null || p1 === null || p0 > 0xff || p1 > 0xffffff) return null;
    return [p0, (p1 >>> 16) & 0xff, (p1 >>> 8) & 0xff, p1 & 0xff];
  }
  if (parts.length === 3) {
    const p0 = parsePart(parts[0]);
    const p1 = parsePart(parts[1]);
    const p2 = parsePart(parts[2]);
    if (p0 === null || p1 === null || p2 === null || p0 > 0xff || p1 > 0xff || p2 > 0xffff) return null;
    return [p0, p1, (p2 >>> 8) & 0xff, p2 & 0xff];
  }
  if (parts.length === 4) {
    const p0 = parsePart(parts[0]);
    const p1 = parsePart(parts[1]);
    const p2 = parsePart(parts[2]);
    const p3 = parsePart(parts[3]);
    if (
      p0 === null ||
      p1 === null ||
      p2 === null ||
      p3 === null ||
      p0 > 0xff ||
      p1 > 0xff ||
      p2 > 0xff ||
      p3 > 0xff
    ) {
      return null;
    }
    return [p0, p1, p2, p3];
  }
  return null;
}

/**
 * Comprehensive IPv4 special-purpose & reserved check against authoritative IANA registries:
 * - 0.0.0.0/8 (This host on this network, RFC 1122)
 * - 10.0.0.0/8 (Private-Use, RFC 1918)
 * - 100.64.0.0/10 (Shared Address Space / CGNAT, RFC 6598)
 * - 127.0.0.0/8 (Loopback, RFC 1122)
 * - 169.254.0.0/16 (Link Local, RFC 3927)
 * - 172.16.0.0/12 (Private-Use, RFC 1918)
 * - 192.0.0.0/24 (IETF Protocol Assignments, RFC 6890)
 * - 192.0.2.0/24 (TEST-NET-1, RFC 5737)
 * - 192.88.99.0/24 (6to4 Relay Anycast, RFC 7526)
 * - 192.168.0.0/16 (Private-Use, RFC 1918)
 * - 198.18.0.0/15 (Benchmarking, RFC 2544)
 * - 198.51.100.0/24 (TEST-NET-2, RFC 5737)
 * - 203.0.113.0/24 (TEST-NET-3, RFC 5737)
 * - 224.0.0.0/4 (Multicast, RFC 5771)
 * - 240.0.0.0/4 (Reserved for Future Use / Broadcast, RFC 1112 / RFC 8190)
 */
export function isPrivateOrReservedIpv4(octets: [number, number, number, number]): boolean {
  const [o1, o2, o3] = octets;
  if (o1 === 0) return true;
  if (o1 === 10) return true;
  if (o1 === 100 && o2 >= 64 && o2 <= 127) return true;
  if (o1 === 127) return true;
  if (o1 === 169 && o2 === 254) return true;
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
  if (o1 === 192 && o2 === 0 && o3 === 0) return true;
  if (o1 === 192 && o2 === 0 && o3 === 2) return true;
  if (o1 === 192 && o2 === 88 && o3 === 99) return true;
  if (o1 === 192 && o2 === 168) return true;
  if (o1 === 198 && (o2 === 18 || o2 === 19)) return true;
  if (o1 === 198 && o2 === 51 && o3 === 100) return true;
  if (o1 === 203 && o2 === 0 && o3 === 113) return true;
  if (o1 >= 224) return true;
  return false;
}

/**
 * Parses any valid IPv6 string into eight 16-bit hextets.
 * Handles :: compression, embedded IPv4 notation, bracketed notation, and zone identifiers.
 */
export function parseIpv6ToHextets(
  ipv6Str: string
): [number, number, number, number, number, number, number, number] | null {
  let cleaned = ipv6Str.trim().toLowerCase();
  if (cleaned.startsWith('[') && cleaned.endsWith(']')) {
    cleaned = cleaned.slice(1, -1);
  }
  if (cleaned.includes('%')) {
    cleaned = cleaned.split('%')[0];
  }

  let embeddedIpv4Hextets: [number, number] | null = null;
  const lastColon = cleaned.lastIndexOf(':');
  if (lastColon !== -1) {
    const afterColon = cleaned.slice(lastColon + 1);
    if (afterColon.includes('.')) {
      const v4Octets = parseIpv4ToOctets(afterColon);
      if (!v4Octets) return null;
      embeddedIpv4Hextets = [
        ((v4Octets[0] << 8) | v4Octets[1]) & 0xffff,
        ((v4Octets[2] << 8) | v4Octets[3]) & 0xffff,
      ];
      cleaned = cleaned.slice(0, lastColon);
      if (cleaned.endsWith(':')) {
        cleaned += ':';
      }
    }
  }

  const doubleColonCount = (cleaned.match(/::/g) || []).length;
  if (doubleColonCount > 1) return null;

  let hextets: number[] = [];

  if (doubleColonCount === 1) {
    const [leftPart, rightPart] = cleaned.split('::');
    const leftRaw = leftPart ? leftPart.split(':') : [];
    const rightRaw = rightPart ? rightPart.split(':') : [];

    const leftHextets: number[] = [];
    for (const h of leftRaw) {
      if (!/^[0-9a-f]{1,4}$/i.test(h)) return null;
      leftHextets.push(parseInt(h, 16));
    }

    const rightHextets: number[] = [];
    for (const h of rightRaw) {
      if (!/^[0-9a-f]{1,4}$/i.test(h)) return null;
      rightHextets.push(parseInt(h, 16));
    }

    const totalProvided =
      leftHextets.length + rightHextets.length + (embeddedIpv4Hextets ? 2 : 0);
    if (totalProvided > 7) return null;
    const zerosNeeded = 8 - totalProvided;
    const zeros = new Array(zerosNeeded).fill(0);

    hextets = [
      ...leftHextets,
      ...zeros,
      ...rightHextets,
      ...(embeddedIpv4Hextets ? embeddedIpv4Hextets : []),
    ];
  } else {
    const parts = cleaned.split(':');
    const expected = embeddedIpv4Hextets ? 6 : 8;
    if (parts.length !== expected) return null;
    for (const h of parts) {
      if (!/^[0-9a-f]{1,4}$/i.test(h)) return null;
      hextets.push(parseInt(h, 16));
    }
    if (embeddedIpv4Hextets) {
      hextets.push(...embeddedIpv4Hextets);
    }
  }

  if (hextets.length !== 8) return null;
  return hextets as [number, number, number, number, number, number, number, number];
}

/**
 * Comprehensive IPv6 special-purpose & reserved check against authoritative IANA registries:
 * - ::/128 (Unspecified, RFC 4291)
 * - ::1/128 (Loopback, RFC 4291)
 * - ::ffff:0:0/96 (IPv4-mapped, RFC 4291)
 * - ::ffff:0:0:0/96 (IPv4-translated, RFC 6052)
 * - 64:ff9b::/96 (IPv4/IPv6 translation, RFC 6052)
 * - 64:ff9b:1::/48 (Local-Use IPv4/IPv6 translation, RFC 8215)
 * - 100::/64 (Discard-Only Prefix, RFC 6666)
 * - 2001::/23 (IETF Protocol Assignments, RFC 2928, including Teredo, Benchmarking, ORCHID, Documentation)
 * - 2002::/16 (6to4, RFC 3056 / RFC 7526)
 * - fc00::/7 (Unique Local Address - ULA, RFC 4193)
 * - fe80::/10 (Link-Local Unicast, RFC 4291)
 * - ff00::/8 (Multicast, RFC 4291)
 * - Non-global zone identifiers
 */
export function isPrivateOrReservedIpv6(ipv6Str: string): boolean {
  let cleaned = ipv6Str.trim().toLowerCase();
  if (cleaned.startsWith('[') && cleaned.endsWith(']')) cleaned = cleaned.slice(1, -1);
  if (cleaned.includes('%')) {
    return true; // Zone-scoped interface address
  }
  const hextets = parseIpv6ToHextets(cleaned);
  if (!hextets) return false;

  const [h0, h1, h2, h3, h4, h5, h6, h7] = hextets;

  // ::/128 (Unspecified)
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0 && h6 === 0 && h7 === 0) {
    return true;
  }
  // ::1/128 (Loopback)
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0 && h6 === 0 && h7 === 1) {
    return true;
  }
  // ::ffff:0:0/96 (IPv4-mapped)
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0xffff) {
    const mappedOctets: [number, number, number, number] = [
      (h6 >>> 8) & 0xff,
      h6 & 0xff,
      (h7 >>> 8) & 0xff,
      h7 & 0xff,
    ];
    if (isPrivateOrReservedIpv4(mappedOctets)) return true;
    return true; // Disallow all IPv4-mapped addresses in web crawler context to prevent bypass
  }
  // ::ffff:0:0:0/96 (IPv4-translated)
  if (h0 === 0 && h1 === 0 && h2 === 0 && h3 === 0 && h4 === 0xffff && h5 === 0) {
    return true;
  }
  // 64:ff9b::/96 (IPv4/IPv6 translation)
  if (h0 === 0x0064 && h1 === 0xff9b && h2 === 0 && h3 === 0 && h4 === 0 && h5 === 0) {
    return true;
  }
  // 64:ff9b:1::/48 (Local-Use IPv4/IPv6 translation)
  if (h0 === 0x0064 && h1 === 0xff9b && h2 === 0x0001) {
    return true;
  }
  // 100::/64 (Discard-Only Prefix)
  if (h0 === 0x0100 && h1 === 0 && h2 === 0 && h3 === 0) {
    return true;
  }
  // 2001::/23 (IETF Protocol Assignments)
  if (h0 === 0x2001 && (h1 & 0xfe00) === 0) {
    return true;
  }
  // 2001:db8::/32 (Documentation, RFC 3849)
  if (h0 === 0x2001 && h1 === 0x0db8) {
    return true;
  }
  // 2002::/16 (6to4)
  if (h0 === 0x2002) {
    return true;
  }
  // fc00::/7 (Unique Local Address - ULA)
  if ((h0 & 0xfe00) === 0xfc00) {
    return true;
  }
  // fe80::/10 (Link-Local Unicast)
  if ((h0 & 0xffc0) === 0xfe80) {
    return true;
  }
  // ff00::/8 (Multicast)
  if ((h0 & 0xff00) === 0xff00) {
    return true;
  }

  return false;
}

export function isPrivateOrReservedIp(ipStr: string): boolean {
  if (typeof ipStr !== 'string' || !ipStr.trim()) return false;
  const clean = ipStr.trim().replace(/^\[|\]$/g, '');
  if (clean.includes('%')) return true;

  const v4 = parseIpv4ToOctets(clean);
  if (v4) return isPrivateOrReservedIpv4(v4);

  const v6 = parseIpv6ToHextets(clean);
  if (v6) return isPrivateOrReservedIpv6(clean);

  return false;
}

export class SafeConnectionFetcher {
  public static async fetch(options: PinnedFetchOptions): Promise<PinnedFetchResponse> {
    const {
      url: initialUrl,
      allowedOrigin,
      timeoutMs = 8000,
      maxByteSize = 1024 * 1024,
      maxRedirects = 5,
      customResolver,
      customRequester,
      userAgent = 'IAC-InterviewAssistant/1.0 (+https://github.com/Abhitvg/IAC; Candidate Research)',
      customCa,
      _testOnlyAllowLoopback = false,
    } = options;

    const allowTestLoopback = Boolean(
      process.env.NODE_ENV === 'test' && _testOnlyAllowLoopback
    );

    const startTime = Date.now();
    const redirects: string[] = [];
    const redirectHistory = new Set<string>();

    let currentUrl = initialUrl;
    let redirectHops = 0;

    const globalController = new AbortController();
    let timeoutId: NodeJS.Timeout | null = null;

    const remainingTime = () => {
      const elapsed = Date.now() - startTime;
      const left = timeoutMs - elapsed;
      return left > 0 ? left : 0;
    };

    const timeoutPromise = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        globalController.abort();
        reject(new Error(`Crawler request timed out after ${timeoutMs}ms (lifecycle budget exceeded)`));
      }, timeoutMs);
    });

    try {
      const fetchPromise = (async (): Promise<PinnedFetchResponse> => {
        while (redirectHops <= maxRedirects) {
          if (remainingTime() <= 0) {
            throw new Error(`Crawler request timed out after ${timeoutMs}ms`);
          }

          let parsed: URL;
          try {
            parsed = new URL(currentUrl.trim());
          } catch {
            throw new Error(`Invalid URL format: ${currentUrl}`);
          }

          if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
            throw new Error(`Blocked unsupported protocol "${parsed.protocol}". Only http: and https: are allowed.`);
          }

          if (parsed.username || parsed.password) {
            throw new Error('URLs containing embedded credentials (userinfo) are prohibited.');
          }

          const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');
          if (
            (BLOCKED_HOSTNAMES.has(hostname) && !allowTestLoopback) ||
            hostname.endsWith('.local') ||
            hostname.endsWith('.internal')
          ) {
            throw new Error(`Blocked restricted hostname: ${hostname}`);
          }

          if (isPrivateOrReservedIp(hostname) && !allowTestLoopback) {
            throw new Error(`Blocked connection to private or reserved IP: ${hostname}`);
          }

          // Enforce origin match if allowedOrigin is specified
          if (allowedOrigin) {
            const allowed = new URL(allowedOrigin);
            if (parsed.protocol !== allowed.protocol) {
              throw new Error(`Protocol mismatch: expected ${allowed.protocol}, got ${parsed.protocol}`);
            }
            if (parsed.hostname.toLowerCase() !== allowed.hostname.toLowerCase()) {
              throw new Error(`Cross-origin request rejected: expected ${allowed.hostname}, got ${parsed.hostname}`);
            }
            const currentPort = parsed.port || (parsed.protocol === 'https:' ? '443' : '80');
            const allowedPort = allowed.port || (allowed.protocol === 'https:' ? '443' : '80');
            if (currentPort !== allowedPort) {
              throw new Error(`Port mismatch: expected ${allowedPort}, got ${currentPort}`);
            }
          }

          // Resolve DNS and reject any mixed/prohibited addresses
          let resolvedIp: string;
          let ipFamily: 4 | 6;

          const isDirectIp = Boolean(parseIpv4ToOctets(hostname) || hostname.includes(':'));
          if (isDirectIp) {
            resolvedIp = hostname;
            ipFamily = hostname.includes(':') ? 6 : 4;
          } else {
            let addresses: Array<{ address: string; family: number }>;
            if (customResolver) {
              addresses = await customResolver(hostname);
            } else {
              addresses = await new Promise((res, rej) => {
                dns.lookup(hostname, { all: true }, (err, addrs) => {
                  if (err) return rej(err);
                  res(addrs as Array<{ address: string; family: number }>);
                });
              });
            }

            if (!addresses || addresses.length === 0) {
              throw new Error(`DNS resolution returned no addresses for ${hostname}`);
            }

            // Reject if ANY address in the DNS response is private/prohibited
            for (const addr of addresses) {
              if (isPrivateOrReservedIp(addr.address) && !allowTestLoopback) {
                throw new Error(
                  `DNS resolution for ${hostname} returned prohibited internal IP: ${addr.address} (mixed answer defense)`
                );
              }
            }

            resolvedIp = addresses[0].address;
            ipFamily = addresses[0].family === 6 ? 6 : 4;
          }

          const isHttps = parsed.protocol === 'https:';

          const singleHopResult = customRequester
            ? await customRequester({
                targetUrl: parsed,
                isHttps,
                pinnedIp: resolvedIp,
                ipFamily,
                maxByteSize,
                userAgent,
                signal: globalController.signal,
              })
            : await SafeConnectionFetcher.executePinnedRequest({
                targetUrl: parsed,
                isHttps,
                pinnedIp: resolvedIp,
                ipFamily,
                maxByteSize,
                userAgent,
                signal: globalController.signal,
                ca: customCa,
              });

          if ([301, 302, 303, 307, 308].includes(singleHopResult.statusCode)) {
            redirectHops++;
            if (redirectHops > maxRedirects) {
              throw new Error(`Maximum redirect limit of ${maxRedirects} exceeded`);
            }
            const location = singleHopResult.location;
            if (!location) {
              throw new Error(`Redirect status ${singleHopResult.statusCode} missing Location header`);
            }
            const nextUrl = new URL(location, currentUrl).toString();

            if (isHttps && nextUrl.startsWith('http://')) {
              throw new Error(`Prohibited HTTPS to HTTP protocol downgrade on redirect: ${nextUrl}`);
            }

            if (redirectHistory.has(nextUrl)) {
              throw new Error(`Redirect loop detected for destination: ${nextUrl}`);
            }

            redirects.push(nextUrl);
            redirectHistory.add(nextUrl);
            currentUrl = nextUrl;
            continue;
          }

          return {
            statusCode: singleHopResult.statusCode,
            finalUrl: parsed.toString(),
            contentType: singleHopResult.contentType,
            body: singleHopResult.body,
            byteSize: singleHopResult.byteSize,
            pinnedIp: resolvedIp,
            redirects,
          };
        }

        throw new Error(`Maximum redirect limit of ${maxRedirects} exceeded`);
      })();

      return await Promise.race([fetchPromise, timeoutPromise]);
    } finally {
      if (timeoutId) {
        clearTimeout(timeoutId);
      }
    }
  }

  public static executePinnedRequest(params: {
    targetUrl: URL;
    isHttps: boolean;
    pinnedIp: string;
    ipFamily: 4 | 6;
    maxByteSize: number;
    userAgent: string;
    signal: AbortSignal;
    ca?: string | Buffer | Array<string | Buffer>;
  }): Promise<{
    statusCode: number;
    contentType: string;
    location?: string;
    body: string;
    byteSize: number;
  }> {
    const { targetUrl, isHttps, pinnedIp, ipFamily, maxByteSize, userAgent, signal, ca } = params;

    return new Promise((resolve, reject) => {
      let aborted = false;
      const requestLib = isHttps ? https : http;
      const defaultPort = isHttps ? 443 : 80;
      const port = targetUrl.port ? parseInt(targetUrl.port, 10) : defaultPort;

      const lookupFn = (
        _hostname: string,
        options: any,
        callback: any
      ) => {
        const cb = typeof options === 'function' ? options : callback;
        const isAll = Boolean(options && typeof options === 'object' && options.all);

        // Enforce pinned connection to validated IP, handling both standard and all: true (Node 20+ autoSelectFamily)
        if (isAll) {
          cb(null, [{ address: pinnedIp, family: ipFamily }]);
        } else {
          cb(null, pinnedIp, ipFamily);
        }
      };

      const requestOptions: http.RequestOptions = {
        hostname: targetUrl.hostname,
        port,
        path: targetUrl.pathname + targetUrl.search,
        method: 'GET',
        headers: {
          Host: targetUrl.host,
          'User-Agent': userAgent,
          Accept: 'text/html,application/xhtml+xml',
          'Accept-Encoding': 'identity',
          Connection: 'close',
        },
        lookup: lookupFn,
      };

      if (isHttps) {
        (requestOptions as https.RequestOptions).servername = targetUrl.hostname;
        if (ca) {
          (requestOptions as https.RequestOptions).ca = ca;
        }
      }

      const req = requestLib.request(requestOptions, (res) => {
        const statusCode = res.statusCode || 0;
        const contentType = res.headers['content-type'] || '';
        const location = res.headers['location'];

        if ([301, 302, 303, 307, 308].includes(statusCode)) {
          res.resume();
          resolve({
            statusCode,
            contentType,
            location: Array.isArray(location) ? location[0] : location,
            body: '',
            byteSize: 0,
          });
          return;
        }

        if (
          statusCode >= 200 &&
          statusCode < 300 &&
          !contentType.includes('text/html') &&
          !contentType.includes('application/xhtml+xml')
        ) {
          res.resume();
          reject(new Error(`Rejected unsupported Content-Type: "${contentType}". Only text/html is supported.`));
          return;
        }

        let totalBytes = 0;
        const chunks: Buffer[] = [];

        res.on('data', (chunk: Buffer) => {
          if (aborted) return;
          totalBytes += chunk.length;
          if (totalBytes > maxByteSize) {
            aborted = true;
            req.destroy(new Error(`Response exceeded maximum size limit of ${maxByteSize} bytes`));
            reject(new Error(`Response exceeded maximum size limit of ${maxByteSize} bytes`));
            return;
          }
          chunks.push(chunk);
        });

        res.on('end', () => {
          if (aborted) return;
          const fullBody = Buffer.concat(chunks).toString('utf-8');
          resolve({
            statusCode,
            contentType,
            location: Array.isArray(location) ? location[0] : location,
            body: fullBody,
            byteSize: totalBytes,
          });
        });

        res.on('error', (err) => {
          if (!aborted) reject(err);
        });
      });

      const onAbort = () => {
        aborted = true;
        req.destroy(new Error('Request aborted by signal'));
        reject(new Error('Request aborted by signal'));
      };

      if (signal.aborted) {
        onAbort();
        return;
      }
      signal.addEventListener('abort', onAbort, { once: true });

      req.on('error', (err) => {
        signal.removeEventListener('abort', onAbort);
        if (!aborted) reject(err);
      });

      req.end();
    });
  }
}
