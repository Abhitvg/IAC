import { describe, it, expect } from 'vitest';
import {
  SafeConnectionFetcher,
  PinnedRequester,
  isPrivateOrReservedIp,
  parseIpv4ToOctets,
  parseIpv6ToHextets,
} from '../electron/services/safeConnectionFetcher';

describe('Crawler DNS Rebinding, Lifecycle Timeout & Security Tests (P0)', () => {
  const publicExampleIp = '93.184.216.34';
  const validResolver = async () => [{ address: publicExampleIp, family: 4 }];

  it('enforces connection-level pinning to validated destination and preserves SNI/Host headers', async () => {
    let capturedParams: any = null;

    const mockRequester: PinnedRequester = async (params) => {
      capturedParams = params;
      return {
        statusCode: 200,
        contentType: 'text/html',
        body: '<html><body>Mock Public Site</body></html>',
        byteSize: 45,
      };
    };

    const result = await SafeConnectionFetcher.fetch({
      url: 'https://example.com/research?candidate=1',
      customResolver: validResolver,
      customRequester: mockRequester,
    });

    expect(capturedParams).not.toBeNull();
    // Validated IP must be pinned to the outbound request
    expect(capturedParams.pinnedIp).toBe(publicExampleIp);
    expect(capturedParams.ipFamily).toBe(4);
    // SNI and Host header target hostname must match original URL
    expect(capturedParams.targetUrl.hostname).toBe('example.com');
    expect(capturedParams.isHttps).toBe(true);
    expect(result.statusCode).toBe(200);
    expect(result.pinnedIp).toBe(publicExampleIp);
    expect(result.body).toContain('Mock Public Site');
  });

  it('rejects mixed DNS answers containing any prohibited address (mixed answer defense)', async () => {
    // Custom resolver simulating attacker DNS returning both public IP and internal loopback
    const mixedResolver = async () => [
      { address: publicExampleIp, family: 4 },
      { address: '127.0.0.1', family: 4 },
    ];

    let requestAttempted = false;
    const mockRequester: PinnedRequester = async () => {
      requestAttempted = true;
      return { statusCode: 200, contentType: 'text/html', body: '', byteSize: 0 };
    };

    await expect(
      SafeConnectionFetcher.fetch({
        url: 'http://example.com/index.html',
        customResolver: mixedResolver,
        customRequester: mockRequester,
      })
    ).rejects.toThrow(/prohibited internal IP.*mixed answer defense/i);

    // Mixed answer defense must abort BEFORE initiating any socket connection
    expect(requestAttempted).toBe(false);
  });

  it('defeats DNS rebinding during redirect hops by re-validating every destination', async () => {
    let hopCount = 0;

    // Hop 1 resolves to public IP; Hop 2 resolves to cloud metadata IP
    const rebindingResolver = async (_hostname: string) => {
      hopCount++;
      if (hopCount === 1) {
        return [{ address: publicExampleIp, family: 4 }];
      }
      return [{ address: '169.254.169.254', family: 4 }];
    };

    let secondHopExecuted = false;
    const redirectRequester: PinnedRequester = async (params) => {
      if (params.targetUrl.pathname === '/hop1') {
        return {
          statusCode: 302,
          contentType: 'text/html',
          location: 'https://example.com/hop2',
          body: '',
          byteSize: 0,
        };
      }
      secondHopExecuted = true;
      return { statusCode: 200, contentType: 'text/html', body: 'Sensitive AWS Metadata', byteSize: 22 };
    };

    await expect(
      SafeConnectionFetcher.fetch({
        url: 'https://example.com/hop1',
        customResolver: rebindingResolver,
        customRequester: redirectRequester,
      })
    ).rejects.toThrow(/prohibited internal IP.*mixed answer defense|Blocked restricted hostname|private or reserved/i);

    // The second hop must never be dispatched to the internal address
    expect(secondHopExecuted).toBe(false);
  });

  it('aborts when server sends headers immediately and then stalls indefinitely (lifecycle timeout)', async () => {
    let actualRequestMade = false;

    const stalledRequester: PinnedRequester = ({ signal }) => {
      actualRequestMade = true;
      return new Promise((_, reject) => {
        const onAbort = () => reject(new Error('Request aborted by signal (simulated stall)'));
        if (signal.aborted) return onAbort();
        signal.addEventListener('abort', onAbort, { once: true });
      });
    };

    const start = Date.now();
    await expect(
      SafeConnectionFetcher.fetch({
        url: 'https://example.com/stalled.html',
        timeoutMs: 300,
        customResolver: validResolver,
        customRequester: stalledRequester,
      })
    ).rejects.toThrow(/Crawler request timed out after 300ms/i);

    const elapsed = Date.now() - start;
    expect(actualRequestMade).toBe(true);
    // Timeout must abort close to 300ms budget
    expect(elapsed).toBeLessThan(1000);
  });

  it('aborts response streaming immediately when payload exceeds maxByteSize', async () => {
    let actualStreamStarted = false;

    const oversizedRequester: PinnedRequester = async ({ maxByteSize }) => {
      actualStreamStarted = true;
      let total = 0;
      for (let i = 0; i < 5; i++) {
        total += 4000;
        if (total > maxByteSize) {
          throw new Error(`Response exceeded maximum size limit of ${maxByteSize} bytes`);
        }
      }
      return { statusCode: 200, contentType: 'text/html', body: 'OK', byteSize: total };
    };

    await expect(
      SafeConnectionFetcher.fetch({
        url: 'https://example.com/large.html',
        maxByteSize: 10000, // 10KB limit
        customResolver: validResolver,
        customRequester: oversizedRequester,
      })
    ).rejects.toThrow(/Response exceeded maximum size limit of 10000 bytes/i);

    expect(actualStreamStarted).toBe(true);
  });

  it('strictly rejects redirects that violate allowedOrigin policy', async () => {
    let crossOriginHopAttempted = false;

    const crossOriginRequester: PinnedRequester = async (params) => {
      if (params.targetUrl.hostname === 'example.com') {
        return {
          statusCode: 302,
          contentType: 'text/html',
          location: 'https://malicious-attacker.com/steal-creds',
          body: '',
          byteSize: 0,
        };
      }
      crossOriginHopAttempted = true;
      return { statusCode: 200, contentType: 'text/html', body: '', byteSize: 0 };
    };

    await expect(
      SafeConnectionFetcher.fetch({
        url: 'https://example.com/portfolio',
        allowedOrigin: 'https://example.com',
        customResolver: validResolver,
        customRequester: crossOriginRequester,
      })
    ).rejects.toThrow(/Cross-origin request rejected: expected example.com, got malicious-attacker.com/i);

    expect(crossOriginHopAttempted).toBe(false);
  });

  it('strictly rejects HTTPS to HTTP protocol downgrade on redirects', async () => {
    const downgradeRequester: PinnedRequester = async () => ({
      statusCode: 302,
      contentType: 'text/html',
      location: 'http://example.com/insecure-target',
      body: '',
      byteSize: 0,
    });

    await expect(
      SafeConnectionFetcher.fetch({
        url: 'https://example.com/secure-start',
        customResolver: validResolver,
        customRequester: downgradeRequester,
      })
    ).rejects.toThrow(/Prohibited HTTPS to HTTP protocol downgrade on redirect/i);
  });
});
