import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import http from 'http';
import https from 'https';
import { URL } from 'url';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { execSync } from 'child_process';
import { SafeConnectionFetcher } from '../electron/services/safeConnectionFetcher';

describe('Production HTTP Transport Integration Tests (Real Sockets & Pinned Lookup)', () => {
  const activeHttpServers: http.Server[] = [];
  const activeHttpsServers: https.Server[] = [];

  let tlsFixtureDir: string;
  let caCert: Buffer;
  let validServerKey: Buffer;
  let validServerCert: Buffer;
  let mismatchedServerKey: Buffer;
  let mismatchedServerCert: Buffer;
  let untrustedServerKey: Buffer;
  let untrustedServerCert: Buffer;

  beforeAll(() => {
    // Generate deterministic test CA and X.509 certificates for genuine TLS verification
    tlsFixtureDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iac-tls-gate-'));

    // 1. Root Certificate Authority
    execSync(
      'openssl req -x509 -newkey rsa:2048 -nodes -keyout ca.key -out ca.crt -days 1 -subj "/CN=IACTestRootCA"',
      { cwd: tlsFixtureDir, stdio: 'pipe' }
    );
    caCert = fs.readFileSync(path.join(tlsFixtureDir, 'ca.crt'));

    // 2. Valid server cert for candidate-secure.test with SAN
    const validExt =
      'basicConstraints=CA:FALSE\nsubjectAltName=@alt_names\n[alt_names]\nDNS.1=candidate-secure.test\nDNS.2=localhost';
    fs.writeFileSync(path.join(tlsFixtureDir, 'valid_ext.cnf'), validExt);
    execSync(
      'openssl req -newkey rsa:2048 -nodes -keyout server_valid.key -out server_valid.csr -subj "/CN=candidate-secure.test"',
      { cwd: tlsFixtureDir, stdio: 'pipe' }
    );
    execSync(
      'openssl x509 -req -in server_valid.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server_valid.crt -days 1 -extfile valid_ext.cnf',
      { cwd: tlsFixtureDir, stdio: 'pipe' }
    );
    validServerKey = fs.readFileSync(path.join(tlsFixtureDir, 'server_valid.key'));
    validServerCert = fs.readFileSync(path.join(tlsFixtureDir, 'server_valid.crt'));

    // 3. Mismatched server cert for mismatched-domain.test
    const mismatchExt =
      'basicConstraints=CA:FALSE\nsubjectAltName=@alt_names\n[alt_names]\nDNS.1=mismatched-domain.test';
    fs.writeFileSync(path.join(tlsFixtureDir, 'mismatch_ext.cnf'), mismatchExt);
    execSync(
      'openssl req -newkey rsa:2048 -nodes -keyout server_mismatch.key -out server_mismatch.csr -subj "/CN=mismatched-domain.test"',
      { cwd: tlsFixtureDir, stdio: 'pipe' }
    );
    execSync(
      'openssl x509 -req -in server_mismatch.csr -CA ca.crt -CAkey ca.key -CAcreateserial -out server_mismatch.crt -days 1 -extfile mismatch_ext.cnf',
      { cwd: tlsFixtureDir, stdio: 'pipe' }
    );
    mismatchedServerKey = fs.readFileSync(path.join(tlsFixtureDir, 'server_mismatch.key'));
    mismatchedServerCert = fs.readFileSync(path.join(tlsFixtureDir, 'server_mismatch.crt'));

    // 4. Untrusted self-signed certificate (not signed by IACTestRootCA)
    execSync(
      'openssl req -x509 -newkey rsa:2048 -nodes -keyout untrusted.key -out untrusted.crt -days 1 -subj "/CN=candidate-secure.test"',
      { cwd: tlsFixtureDir, stdio: 'pipe' }
    );
    untrustedServerKey = fs.readFileSync(path.join(tlsFixtureDir, 'untrusted.key'));
    untrustedServerCert = fs.readFileSync(path.join(tlsFixtureDir, 'untrusted.crt'));
  });

  afterAll(async () => {
    for (const server of activeHttpServers) {
      try {
        server.close();
      } catch {}
    }
    for (const server of activeHttpsServers) {
      try {
        server.close();
      } catch {}
    }
    try {
      if (tlsFixtureDir && fs.existsSync(tlsFixtureDir)) {
        fs.rmSync(tlsFixtureDir, { recursive: true, force: true });
      }
    } catch {}
  });

  const startHttpServer = (
    handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
  ): Promise<{ port: number; close: () => Promise<void> }> => {
    return new Promise((resolve) => {
      const server = http.createServer(handler);
      server.listen(0, '127.0.0.1', () => {
        activeHttpServers.push(server);
        const addr = server.address() as any;
        resolve({
          port: addr.port,
          close: () => new Promise((res) => server.close(() => res())),
        });
      });
    });
  };

  const startHttpsServer = (
    key: Buffer,
    cert: Buffer,
    handler: (req: http.IncomingMessage, res: http.ServerResponse) => void
  ): Promise<{ port: number; close: () => Promise<void> }> => {
    return new Promise((resolve) => {
      const server = https.createServer({ key, cert }, handler);
      server.listen(0, '127.0.0.1', () => {
        activeHttpsServers.push(server);
        const addr = server.address() as any;
        resolve({
          port: addr.port,
          close: () => new Promise((res) => server.close(() => res())),
        });
      });
    });
  };

  it('connects socket to exact validated IP while preserving original Host header (production executePinnedRequest)', async () => {
    let capturedHost = '';
    let capturedRemoteIp = '';
    let capturedPath = '';

    const { port, close } = await startHttpServer((req, res) => {
      capturedHost = req.headers.host || '';
      capturedRemoteIp = req.socket.remoteAddress || '';
      capturedPath = req.url || '';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body>Real Socket Response</body></html>');
    });

    try {
      const controller = new AbortController();
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
      expect(capturedRemoteIp).toBe('127.0.0.1');
      expect(capturedHost).toBe(`unresolvable-candidate-vault-site.org:${port}`);
      expect(capturedPath).toBe('/portfolio/cv.html?view=full');
    } finally {
      await close();
    }
  });

  it('guarantees DNS changes after validation cannot redirect the socket', async () => {
    let connectionCount = 0;
    const { port, close } = await startHttpServer((_req, res) => {
      connectionCount++;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('<html>Connected to pinned local port</html>');
    });

    try {
      let lookupCallCount = 0;
      const changingResolver = async () => {
        lookupCallCount++;
        if (lookupCallCount === 1) {
          return [{ address: '127.0.0.1', family: 4 }];
        }
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

  it('executes genuine HTTPS transport: connects to pinned IP, verifies TLS SNI and Host header with TLS validation intact', async () => {
    let serverReceivedSni = '';
    let serverReceivedHost = '';
    let serverReceivedRemoteIp = '';

    const { port, close } = await startHttpsServer(validServerKey, validServerCert, (req, res) => {
      serverReceivedSni = (req.socket as any).servername || '';
      serverReceivedHost = req.headers.host || '';
      serverReceivedRemoteIp = req.socket.remoteAddress || '';
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end('<html><body>GENUINE_HTTPS_VERIFIED_SUCCESS</body></html>');
    });

    try {
      let resolverCount = 0;
      const mutatingResolver = async () => {
        resolverCount++;
        // First lookup returns 127.0.0.1; subsequent lookups mutate to attacker IP
        return resolverCount === 1
          ? [{ address: '127.0.0.1', family: 4 }]
          : [{ address: '203.0.113.99', family: 4 }];
      };

      const result = await SafeConnectionFetcher.fetch({
        url: `https://candidate-secure.test:${port}/profile/evidence`,
        customResolver: mutatingResolver,
        customCa: caCert,
        _testOnlyAllowLoopback: true,
      });

      // Assert successful encrypted TLS exchange
      expect(result.statusCode).toBe(200);
      expect(result.body).toContain('GENUINE_HTTPS_VERIFIED_SUCCESS');
      expect(result.pinnedIp).toBe('127.0.0.1');

      // Assert server received the original domain for TLS SNI and Host header
      expect(serverReceivedSni).toBe('candidate-secure.test');
      expect(serverReceivedHost).toBe(`candidate-secure.test:${port}`);
      expect(serverReceivedRemoteIp).toBe('127.0.0.1');
    } finally {
      await close();
    }
  });

  it('enforces certificate hostname verification: rejects connections when certificate SAN does not match requested host', async () => {
    // Server presents certificate for mismatched-domain.test
    const { port, close } = await startHttpsServer(mismatchedServerKey, mismatchedServerCert, (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Should not be reached');
    });

    try {
      // Client requests candidate-secure.test, but server cert is for mismatched-domain.test
      await expect(
        SafeConnectionFetcher.fetch({
          url: `https://candidate-secure.test:${port}/secure-data`,
          customCa: caCert,
          _testOnlyAllowLoopback: true,
          customResolver: async () => [{ address: '127.0.0.1', family: 4 }],
        })
      ).rejects.toThrow(/ERR_TLS_CERT_ALTNAME_INVALID|does not match|certificate/i);
    } finally {
      await close();
    }
  });

  it('enforces certificate authority verification: rejects untrusted or self-signed certificates without root CA trust', async () => {
    // Server presents untrusted certificate not signed by trusted root CA
    const { port, close } = await startHttpsServer(untrustedServerKey, untrustedServerCert, (_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end('Should not be reached');
    });

    try {
      // Client connects with caCert (which did NOT sign untrustedServerCert)
      await expect(
        SafeConnectionFetcher.fetch({
          url: `https://candidate-secure.test:${port}/untrusted-data`,
          customCa: caCert,
          _testOnlyAllowLoopback: true,
          customResolver: async () => [{ address: '127.0.0.1', family: 4 }],
        })
      ).rejects.toThrow(/DEPTH_ZERO_SELF_SIGNED_CERT|UNABLE_TO_VERIFY_LEAF_SIGNATURE|self-signed/i);
    } finally {
      await close();
    }
  });

  it('terminates a stalled response body over a real socket via lifecycle timeout', async () => {
    const { port, close } = await startHttpServer((_req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.write('<html><body>Chunk 1 received...');
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
      expect(elapsed).toBeLessThan(1500);
    } finally {
      await close();
    }
  });

  it('destroys real socket and rejects request immediately when response body exceeds maxByteSize', async () => {
    let clientDisconnected = false;

    const { port, close } = await startHttpServer((req, res) => {
      res.writeHead(200, { 'Content-Type': 'text/html' });
      req.on('close', () => {
        clientDisconnected = true;
      });

      res.write('B'.repeat(25000));
      res.write('B'.repeat(25000));
      res.end();
    });

    try {
      await expect(
        SafeConnectionFetcher.fetch({
          url: `http://overflow-test-server.org:${port}/oversized`,
          maxByteSize: 10000,
          _testOnlyAllowLoopback: true,
          customResolver: async () => [{ address: '127.0.0.1', family: 4 }],
        })
      ).rejects.toThrow(/Response exceeded maximum size limit of 10000 bytes/i);

      expect(clientDisconnected).toBe(true);
    } finally {
      await close();
    }
  });

  it('re-validates redirects before initiating a new socket connection', async () => {
    let serverBReached = false;

    const serverB = await startHttpServer((_req, res) => {
      serverBReached = true;
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end('Sensitive data');
    });

    const serverA = await startHttpServer((_req, res) => {
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

      expect(serverBReached).toBe(false);
    } finally {
      await serverA.close();
      await serverB.close();
    }
  });
});
