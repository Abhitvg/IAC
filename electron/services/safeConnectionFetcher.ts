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

export interface PinnedFetchOptions {
  url: string;
  allowedOrigin?: string;
  timeoutMs?: number;
  maxByteSize?: number;
  maxRedirects?: number;
  customResolver?: (hostname: string) => Promise<Array<{ address: string; family: number }>>;
  userAgent?: string;
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

function parseIpv4ToOctets(ipStr: string): [number, number, number, number] | null {
  const trimmed = ipStr.trim();
  if (/^\d+$/.test(trimmed)) {
    const num = Number(trimmed);
    if (!Number.isSafeInteger(num) || num < 0 || num > 0xffffffff) return null;
    return [(num >>> 24) & 0xff, (num >>> 16) & 0xff, (num >>> 8) & 0xff, num & 0xff];
  }
  if (/^0x[0-9a-f]+$/i.test(trimmed)) {
    const num = parseInt(trimmed, 16);
    if (!Number.isSafeInteger(num) || num < 0 || num > 0xffffffff) return null;
    return [(num >>> 24) & 0xff, (num >>> 16) & 0xff, (num >>> 8) & 0xff, num & 0xff];
  }
  const parts = trimmed.split('.');
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    let val: number;
    if (/^0x[0-9a-f]+$/i.test(part)) val = parseInt(part, 16);
    else if (/^0[0-7]+$/.test(part)) val = parseInt(part, 8);
    else if (/^\d+$/.test(part)) val = parseInt(part, 10);
    else return null;
    if (isNaN(val) || val < 0 || val > 255) return null;
    octets.push(val);
  }
  return octets as [number, number, number, number];
}

function isPrivateOrReservedIpv4(octets: [number, number, number, number]): boolean {
  const [o1, o2] = octets;
  if (o1 === 127 || o1 === 10 || o1 === 0) return true;
  if (o1 === 172 && o2 >= 16 && o2 <= 31) return true;
  if (o1 === 192 && o2 === 168) return true;
  if (o1 === 169 && o2 === 254) return true;
  if (o1 === 100 && o2 >= 64 && o2 <= 127) return true;
  if (o1 >= 224) return true;
  return false;
}

function isPrivateOrReservedIpv6(ipv6Str: string): boolean {
  let cleaned = ipv6Str.trim().toLowerCase();
  if (cleaned.startsWith('[') && cleaned.endsWith(']')) cleaned = cleaned.slice(1, -1);
  if (cleaned.includes('%')) cleaned = cleaned.split('%')[0];
  if (cleaned === '::1' || cleaned === '::' || cleaned === '0:0:0:0:0:0:0:1') return true;
  if (/^fe[89ab][0-9a-f]:/i.test(cleaned)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(cleaned)) return true;
  if (cleaned.startsWith('ff')) return true;
  if (cleaned.startsWith('2001:db8:') || cleaned.startsWith('2001:2:')) return true;
  const ipv4Mapped = cleaned.match(/^(?:::ffff:)?(?:0+:)*ffff:(\d+\.\d+\.\d+\.\d+)$/i);
  if (ipv4Mapped) {
    const oct = parseIpv4ToOctets(ipv4Mapped[1]);
    if (oct && isPrivateOrReservedIpv4(oct)) return true;
  }
  return false;
}

export function isPrivateOrReservedIp(ipStr: string): boolean {
  const v4 = parseIpv4ToOctets(ipStr);
  if (v4) return isPrivateOrReservedIpv4(v4);
  if (ipStr.includes(':') || ipStr.startsWith('[') || ipStr.includes('%')) {
    return isPrivateOrReservedIpv6(ipStr);
  }
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
      userAgent = 'IAC-InterviewAssistant/1.0 (+https://github.com/Abhitvg/IAC; Candidate Research)',
    } = options;

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
          if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.local') || hostname.endsWith('.internal')) {
            throw new Error(`Blocked restricted hostname: ${hostname}`);
          }

          if (isPrivateOrReservedIp(hostname)) {
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
              if (isPrivateOrReservedIp(addr.address)) {
                throw new Error(
                  `DNS resolution for ${hostname} returned prohibited internal IP: ${addr.address} (mixed answer defense)`
                );
              }
            }

            resolvedIp = addresses[0].address;
            ipFamily = addresses[0].family === 6 ? 6 : 4;
          }

          const isHttps = parsed.protocol === 'https:';

          const singleHopResult = await SafeConnectionFetcher.executePinnedRequest({
            targetUrl: parsed,
            isHttps,
            pinnedIp: resolvedIp,
            ipFamily,
            maxByteSize,
            userAgent,
            signal: globalController.signal,
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

  private static executePinnedRequest(params: {
    targetUrl: URL;
    isHttps: boolean;
    pinnedIp: string;
    ipFamily: 4 | 6;
    maxByteSize: number;
    userAgent: string;
    signal: AbortSignal;
  }): Promise<{
    statusCode: number;
    contentType: string;
    location?: string;
    body: string;
    byteSize: number;
  }> {
    const { targetUrl, isHttps, pinnedIp, ipFamily, maxByteSize, userAgent, signal } = params;

    return new Promise((resolve, reject) => {
      let aborted = false;
      const requestLib = isHttps ? https : http;
      const defaultPort = isHttps ? 443 : 80;
      const port = targetUrl.port ? parseInt(targetUrl.port, 10) : defaultPort;

      const lookupFn = (
        _hostname: string,
        _options: any,
        callback: (err: Error | null, address: string, family: number) => void
      ) => {
        // Enforce pinned connection to validated IP
        callback(null, pinnedIp, ipFamily);
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
