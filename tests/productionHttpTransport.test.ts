import { describe, it, expect, afterAll } from 'vitest';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import { SafeConnectionFetcher } from '../electron/services/safeConnectionFetcher';

describe('Production HTTP Transport Integration Tests (Real Sockets & Pinned Lookup)', () => {
  const activeServers: http.Server[] = [];

  const startTestServer = (
    handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
  ): Promise<{ port: number; close: () => Promise<void> }> => {
    return new Promise((resolve) => {
      const server = http.createServer(handler);
      server.listen(0, '127.0.0.1', () => {
        activeServers.push(server);
        const addr = server.address() as any;
        resolve({
          port: addr.port,
          close: () => new Promise((res) => server.close(() => res())),
        });
      });
    });
  };

  afterAll(async () => {
    for (const server of activeServers) {
      try {
        server.close();
      } catch {}
    }
  });

  it('connects socket to exact validated IP while preserving original Host header (production executePinnedRequest)', async () => {
    let capturedHost = '';
    let capturedRemoteIp = '';
    let capturedPath = '';

    const { port, close } = await startTestServer((req, res) => {
      capturedHost = req.headers.host || '';
      capturedRemoteIp = req.socket.remoteAddress || '';
      capturedPath = req.url || '';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body>Real Socket Response</body></html>');
    });

    try {
      const controller = new AbortController();
      // Hostname does not need to resolve in DNS because pinnedIp 127.0.0.1 is passed directly to the lookup callback
      const targetUrl = new URL(`http://unresolvable-candidate-vault-site.org:${port}/portfolio/cv.html?view=full`);

      const result = await SafeConnectionFetcher.executePinnedRequest({
        targetUrl,
        isHttps: false,
        pinnedIp: '127.0.0.1',
        ipFamily: 4,
        maxByteSize: 1024 * 1024,
        userAgent: 'IAC-Production-Verifier/1.0',
        signal: controller.signal,
      });

      expect(result.statusCode).toBe(200);
      expect(result.body).toContain('Real Socket Response');
      // Verify the socket physically connected to 127.0.0.1
      expect(capturedRemoteIp).toBe('127.0.0.1');
      // Verify Host header preserved original hostname + port
      expect(capturedHost).toBe(`unresolvable-candidate-vault-site.org:${port}`);
      expect(capturedPath).toBe('/portfolio/cv.html?view=full');
    } finally {
      await close();
    }
  });

  it('guarantees DNS changes after validation cannot redirect the socket', async () => {
    let connectionCount = 0;
    const { port, close } = await startTestServer((_req, res) => {
      connectionCount++;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>Connected to pinned local port</html>');
    });

    try {
      // Custom resolver initially returns 127.0.0.1, then changes to another IP
      let lookupCallCount = 0;
      const changingResolver = async () => {
        lookupCallCount++;
        if (lookupCallCount === 1) {
          return [{ address: '127.0.0.1', family: 4 }];
        }
        // Attacker attempts to change DNS to a different IP
        return [{ address: '198.51.100.1', family: 4 }];
      };

      const result = await SafeConnectionFetcher.fetch({
        url: `http://dynamic-rebind.org:${port}/page`,
        customResolver: changingResolver,
        _testOnlyAllowLoopback: true,
      });

      expect(result.statusCode).toBe(200);
      expect(result.pinnedIp).toBe('127.0.0.1');
      expect(connectionCount).toBe(1);
    } finally {
      await close();
    }
  });

  it('preserves TLS SNI servername and certificate verification parameters on HTTPS requests', async () => {
    // Assert on executePinnedRequest https options
    let capturedHttpsOptions: any = null;
    const originalRequest = https.request;

    (https as any).request = (options: any, callback: any) => {
      capturedHttpsOptions = options;
      // Return a mock client request to avoid needing a live SSL cert
      const req: any = new http.ClientRequest({
        hostname: options.hostname,
        port: options.port,
        path: options.path,
        method: options.method,
      });
      process.nextTick(() => {
        const res: any = {
          statusCode: 200,
          headers: { 'content-type': 'text/html' },
          on: (event: string, cb: any) => {
            if (event === 'data') cb(Buffer.from('<html>HTTPS SNI OK</html>'));
            if (event === 'end') cb();
            return res;
          },
          resume: () => {},
        };
        if (callback) callback(res);
      });
      return req;
    };

    try {
      const controller = new AbortController();
      const targetUrl = new URL('https://secure-candidate-domain.org:8443/projects');

      await SafeConnectionFetcher.executePinnedRequest({
        targetUrl,
        isHttps: true,
        pinnedIp: '93.184.216.34',
        ipFamily: 4,
        maxByteSize: 1024 * 1024,
        userAgent: 'IAC-Production-Verifier/1.0',
        signal: controller.signal,
      });

      expect(capturedHttpsOptions).not.toBeNull();
      // Crucial: SNI servername must match original domain for TLS certificate validation
      expect(capturedHttpsOptions.servername).toBe('secure-candidate-domain.org');
      expect(capturedHttpsOptions.headers.Host).toBe('secure-candidate-domain.org:8443');
    } finally {
      https.request = originalRequest;
    }
  });

  it('terminates a stalled response body over a real socket via lifecycle timeout', async () => {
    const { port, close } = await startTestServer((_req, res) => {
      // Send 200 headers immediately
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.write('<html><body>Chunk 1 received...');
      // Never call res.end() to simulate a server stalled mid-stream
    });

    try {
      const start = Date.now();
      await expect(
        SafeConnectionFetcher.fetch({
          url: `http://stall-test-server.org:${port}/stalled`,
          timeoutMs: 400,
          _testOnlyAllowLoopback: true,
          customResolver: async () => [{ address: '127.0.0.1', family: 4 }],
        })
      ).rejects.toThrow(/timed out.*lifecycle budget exceeded|Request aborted/i);

      const elapsed = Date.now() - start;
      // Must abort promptly around 400ms budget
      expect(elapsed).toBeLessThan(1500);
    } finally {
      await close();
    }
  });

  it('destroys real socket and rejects request immediately when response body exceeds maxByteSize', async () => {
    let clientDisconnected = false;

    const { port, close } = await startTestServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      req.on('close', () => {
        clientDisconnected = true;
      });

      // Write 25KB chunks in rapid succession
      res.write('B'.repeat(25000));
      res.write('B'.repeat(25000));
      res.end();
    });

    try {
      await expect(
        SafeConnectionFetcher.fetch({
          url: `http://overflow-test-server.org:${port}/oversized`,
          maxByteSize: 10000, // 10KB limit
          _testOnlyAllowLoopback: true,
          customResolver: async () => [{ address: '127.0.0.1', family: 4 }],
        })
      ).rejects.toThrow(/Response exceeded maximum size limit of 10000 bytes/i);

      // Verify the connection was severed
      expect(clientDisconnected).toBe(true);
    } finally {
      await close();
    }
  });

  it('re-validates redirects before initiating a new socket connection', async () => {
    let serverBReached = false;

    // Server B (rogue / internal server)
    const serverB = await startTestServer((_req, res) => {
      serverBReached = true;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('Sensitive data');
    });

    // Server A (initial server) redirects to prohibited metadata host
    const serverA = await startTestServer((_req, res) => {
      res.writeHead(302, {
        Location: `http://metadata.google.internal:${serverB.port}/secrets`,
      });
      res.end();
    });

    try {
      await expect(
        SafeConnectionFetcher.fetch({
          url: `http://legit-start.org:${serverA.port}/hop1`,
          _testOnlyAllowLoopback: true,
          customResolver: async () => [{ address: '127.0.0.1', family: 4 }],
        })
      ).rejects.toThrow(/Blocked restricted hostname: metadata\.google\.internal/i);

      // Server B must never have received any request
      expect(serverBReached).toBe(false);
    } finally {
      await serverA.close();
      await serverB.close();
    }
  });
});

