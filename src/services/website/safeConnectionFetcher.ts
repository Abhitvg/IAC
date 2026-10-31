/**
 * Safe Connection Fetcher Client (Renderer & Test Environments)
 *
 * In Electron renderer, delegates connection-level destination pinned fetching
 * across the secure IPC bridge to the main process without bundling Node builtins.
 * In Node.js / Vitest test environments, dynamically delegates to the main implementation.
 */

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

export class SafeConnectionFetcher {
  public static async fetch(options: PinnedFetchOptions): Promise<PinnedFetchResponse> {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.safeFetchPinned) {
      return (window as any).electronAPI.safeFetchPinned(options);
    }

    // In Node.js / Vitest test environments: dynamic import via Function constructor
    // completely prevents Vite bundler from analyzing or attempting to bundle Node builtins (http/https/dns)
    const dynamicImport = new Function('specifier', 'return import(specifier)');
    const { SafeConnectionFetcher: NodeFetcher } = await dynamicImport(
      '../../../electron/services/safeConnectionFetcher'
    );
    return NodeFetcher.fetch(options);
  }
}
