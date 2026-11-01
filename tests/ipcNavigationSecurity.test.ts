import { describe, it, expect } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';
import {
  isTrustedSender,
  isTrustedAppOrigin,
  validateSafeFetchPinnedIpc,
  getApprovedAppHtmlPaths,
  isPermissionAllowed,
} from '../electron/services/security';

describe('IPC Navigation Security & Sender Validation (Blocking Release Gate)', () => {
  const trustedDevUrl = 'http://localhost:5173';
  const approvedPaths = getApprovedAppHtmlPaths();
  const canonicalLocalIndex = approvedPaths[0] || path.resolve(process.cwd(), 'dist/index.html');
  const trustedFileUrl = pathToFileURL(canonicalLocalIndex).href;

  const createMockWindow = (currentUrl: string, isDestroyed = false) => {
    const mainFrame = {
      parent: null,
      url: currentUrl,
    };

    const webContents = {
      mainFrame,
      getURL: () => currentUrl,
      isDestroyed: () => isDestroyed,
    };

    return {
      webContents,
      isDestroyed: () => isDestroyed,
    };
  };

  describe('Legitimate Application Frame Execution', () => {
    it('allows IPC from legitimate main application frame in dev mode (exact origin and port)', () => {
      const mockWindow = createMockWindow(trustedDevUrl);
      const event = {
        sender: mockWindow.webContents,
        senderFrame: mockWindow.webContents.mainFrame,
      };

      expect(isTrustedSender(event, mockWindow, trustedDevUrl)).toBe(true);
    });

    it('allows IPC from legitimate main application frame in production (canonical dist/index.html file URL)', () => {
      const mockWindow = createMockWindow(trustedFileUrl);
      const event = {
        sender: mockWindow.webContents,
        senderFrame: mockWindow.webContents.mainFrame,
      };

      expect(isTrustedSender(event, mockWindow, undefined)).toBe(true);
    });
  });

  describe('Negative Tests: Hostname & URL-Prefix Lookalike Spoofing (Requirement 1)', () => {
    it('rejects attacker domain with dev server url prefix: http://localhost:5173.attacker.example', () => {
      const attackUrl = 'http://localhost:5173.attacker.example';
      expect(isTrustedAppOrigin(attackUrl, trustedDevUrl)).toBe(false);

      const mockWindow = createMockWindow(attackUrl);
      const event = {
        sender: mockWindow.webContents,
        senderFrame: mockWindow.webContents.mainFrame,
      };
      expect(isTrustedSender(event, mockWindow, trustedDevUrl)).toBe(false);
    });

    it('rejects userinfo / credential URL embedding: http://localhost:5173@attacker.example', () => {
      const attackUrl = 'http://localhost:5173@attacker.example';
      expect(isTrustedAppOrigin(attackUrl, trustedDevUrl)).toBe(false);

      const mockWindow = createMockWindow(attackUrl);
      const event = {
        sender: mockWindow.webContents,
        senderFrame: mockWindow.webContents.mainFrame,
      };
      expect(isTrustedSender(event, mockWindow, trustedDevUrl)).toBe(false);
    });

    it('rejects domain suffix lookalike: http://localhost.evil/', () => {
      const attackUrl = 'http://localhost.evil/';
      expect(isTrustedAppOrigin(attackUrl, trustedDevUrl)).toBe(false);

      const mockWindow = createMockWindow(attackUrl);
      const event = {
        sender: mockWindow.webContents,
        senderFrame: mockWindow.webContents.mainFrame,
      };
      expect(isTrustedSender(event, mockWindow, trustedDevUrl)).toBe(false);
    });

    it('rejects mismatched port: http://localhost:3000 when devServer is 5173', () => {
      expect(isTrustedAppOrigin('http://localhost:3000', trustedDevUrl)).toBe(false);
      expect(isTrustedAppOrigin('http://localhost:5174', trustedDevUrl)).toBe(false);
    });

    it('rejects HTTP/HTTPS entirely in production when no devServerUrl is configured', () => {
      expect(isTrustedAppOrigin('http://localhost:5173', undefined)).toBe(false);
      expect(isTrustedAppOrigin('https://localhost:5173', undefined)).toBe(false);
    });
  });

  describe('Negative Tests: Production file: URL Hardening (Requirement 1)', () => {
    it('rejects file:///tmp/attacker.html', () => {
      const attackUrl = 'file:///tmp/attacker.html';
      expect(isTrustedAppOrigin(attackUrl, undefined)).toBe(false);

      const mockWindow = createMockWindow(attackUrl);
      const event = {
        sender: mockWindow.webContents,
        senderFrame: mockWindow.webContents.mainFrame,
      };
      expect(isTrustedSender(event, mockWindow, undefined)).toBe(false);
    });

    it('rejects file:///etc/passwd', () => {
      const attackUrl = 'file:///etc/passwd';
      expect(isTrustedAppOrigin(attackUrl, undefined)).toBe(false);

      const mockWindow = createMockWindow(attackUrl);
      const event = {
        sender: mockWindow.webContents,
        senderFrame: mockWindow.webContents.mainFrame,
      };
      expect(isTrustedSender(event, mockWindow, undefined)).toBe(false);
    });

    it('rejects arbitrary files inside the application bundle (e.g. package.json or main.js)', () => {
      const packageJsonUrl = pathToFileURL(path.resolve(process.cwd(), 'package.json')).href;
      const mainJsUrl = pathToFileURL(path.resolve(process.cwd(), 'electron/main.ts')).href;

      expect(isTrustedAppOrigin(packageJsonUrl, undefined)).toBe(false);
      expect(isTrustedAppOrigin(mainJsUrl, undefined)).toBe(false);
    });

    it('rejects path traversal attempts on file: URLs', () => {
      const traversalUrl = `${trustedFileUrl}/../../package.json`;
      expect(isTrustedAppOrigin(traversalUrl, undefined)).toBe(false);
      expect(isTrustedAppOrigin(`${trustedFileUrl}/../`, undefined)).toBe(false);
      expect(isTrustedAppOrigin(`${trustedFileUrl}/..`, undefined)).toBe(false);
    });

    it('rejects URL-encoded traversal sequences (%2e%2e / %2E%2E)', () => {
      expect(isTrustedAppOrigin(`file:///app/dist/%2e%2e/package.json`, undefined)).toBe(false);
      expect(isTrustedAppOrigin(`file:///app/dist/%2E%2E/package.json`, undefined)).toBe(false);
      expect(isTrustedAppOrigin(`file:///app/dist/%2f%2e%2e%2fevil.html`, undefined)).toBe(false);
    });

    it('rejects alternate backslash separators in file: URLs', () => {
      expect(isTrustedAppOrigin(`file:///app/dist\\index.html`, undefined)).toBe(false);
      expect(isTrustedAppOrigin(`file:///app\\dist\\index.html`, undefined)).toBe(false);
    });

    it('rejects symlink aliases pointing to outside resources or unapproved files', () => {
      const outsideSymlink = 'file:///tmp/symlink_to_index.html';
      expect(isTrustedAppOrigin(outsideSymlink, undefined)).toBe(false);
    });

    it('getApprovedAppHtmlPaths derives from getAppPath and omits process.cwd() in packaged mode', () => {
      const paths = getApprovedAppHtmlPaths();
      expect(Array.isArray(paths)).toBe(true);
      expect(paths.length).toBeGreaterThan(0);
      for (const p of paths) {
        expect(p.endsWith('index.html')).toBe(true);
      }
    });

    it('rejects remote or UNC hostnames on file: URLs (file://attacker.com/evil.html)', () => {
      expect(isTrustedAppOrigin('file://attacker.com/evil.html', undefined)).toBe(false);
    });
  });

  describe('Negative Tests: Malformed, Encoded and Rogue Protocols', () => {
    it('rejects javascript:, data:, and blob: URIs', () => {
      expect(isTrustedAppOrigin('javascript:alert(1)', trustedDevUrl)).toBe(false);
      expect(isTrustedAppOrigin('data:text/html,<script>evil()</script>', trustedDevUrl)).toBe(false);
      expect(isTrustedAppOrigin('blob:http://localhost:5173/uuid', trustedDevUrl)).toBe(false);
      expect(isTrustedAppOrigin('vbscript:msgbox(1)', trustedDevUrl)).toBe(false);
    });

    it('rejects malformed, unparseable, or empty URL strings', () => {
      expect(isTrustedAppOrigin('', trustedDevUrl)).toBe(false);
      expect(isTrustedAppOrigin('   ', trustedDevUrl)).toBe(false);
      expect(isTrustedAppOrigin('htp:/invalid-url', trustedDevUrl)).toBe(false);
      expect(isTrustedAppOrigin('http://[::1%25eth0]:5173', trustedDevUrl)).toBe(false);
      expect(isTrustedAppOrigin(null as any, trustedDevUrl)).toBe(false);
      expect(isTrustedAppOrigin(undefined as any, trustedDevUrl)).toBe(false);
    });
  });

  describe('Negative Tests: Frame Hierarchy, Stale Frames & Navigation Lifecycle', () => {
    it('rejects IPC when invoked from a subframe / embedded iframe', () => {
      const mockWindow = createMockWindow(trustedFileUrl);
      const subframeEvent = {
        sender: mockWindow.webContents,
        senderFrame: {
          parent: mockWindow.webContents.mainFrame, // Child iframe
          url: trustedFileUrl,
        },
      };

      expect(isTrustedSender(subframeEvent, mockWindow, undefined)).toBe(false);
    });

    it('rejects IPC from a stale or replaced frame', () => {
      const mockWindow = createMockWindow(trustedDevUrl);
      const staleFrame = {
        parent: null,
        url: trustedDevUrl,
      };
      // Event uses an orphaned frame object that is no longer mainWindow.webContents.mainFrame
      const event = {
        sender: mockWindow.webContents,
        senderFrame: staleFrame,
      };

      expect(isTrustedSender(event, mockWindow, trustedDevUrl)).toBe(false);
    });

    it('rejects IPC when window navigates away to untrusted site and revokes access', () => {
      const mockWindow = createMockWindow(trustedDevUrl);
      const legitimateEvent = {
        sender: mockWindow.webContents,
        senderFrame: mockWindow.webContents.mainFrame,
      };
      expect(isTrustedSender(legitimateEvent, mockWindow, trustedDevUrl)).toBe(true);

      // Window navigates away to malicious site
      (mockWindow.webContents as any).getURL = () => 'https://malicious-takeover.com/phish';
      (mockWindow.webContents.mainFrame as any).url = 'https://malicious-takeover.com/phish';

      expect(isTrustedSender(legitimateEvent, mockWindow, trustedDevUrl)).toBe(false);
    });

    it('restores IPC access only when window navigates back to a valid trusted entry point', () => {
      const mockWindow = createMockWindow('https://untrusted.com');
      const event = {
        sender: mockWindow.webContents,
        senderFrame: mockWindow.webContents.mainFrame,
      };
      expect(isTrustedSender(event, mockWindow, trustedDevUrl)).toBe(false);

      // Navigate back to genuine dev server
      (mockWindow.webContents as any).getURL = () => trustedDevUrl;
      (mockWindow.webContents.mainFrame as any).url = trustedDevUrl;

      expect(isTrustedSender(event, mockWindow, trustedDevUrl)).toBe(true);
    });

    it('rejects IPC when window or webContents has been destroyed', () => {
      const destroyedWindow = createMockWindow(trustedFileUrl, true);
      const event = {
        sender: destroyedWindow.webContents,
        senderFrame: destroyedWindow.webContents.mainFrame,
      };

      expect(isTrustedSender(event, destroyedWindow, undefined)).toBe(false);
      expect(isTrustedSender(event, null, undefined)).toBe(false);
    });

    it('rejects IPC when sender webContents does not match the main window webContents', () => {
      const mockWindow = createMockWindow(trustedFileUrl);
      const alienEvent = {
        sender: { id: 8888, getURL: () => trustedFileUrl }, // Rogue webContents
        senderFrame: mockWindow.webContents.mainFrame,
      };

      expect(isTrustedSender(alienEvent, mockWindow, undefined)).toBe(false);
    });

    it('validateSafeFetchPinnedIpc denies execution for any untrusted or redirected frame', () => {
      const redirectedWindow = createMockWindow('https://attacker.com/pwn');
      const event = {
        sender: redirectedWindow.webContents,
        senderFrame: redirectedWindow.webContents.mainFrame,
      };

      expect(() =>
        validateSafeFetchPinnedIpc(
          event,
          { url: 'https://attacker.com/data', allowedOrigin: 'https://attacker.com' },
          redirectedWindow
        )
      ).toThrow(/Unauthorized IPC sender/i);
    });
  });

  describe('Audit & Proof of Custom CA / TLS Override Isolation (Requirement 4)', () => {
    const mockWindow = createMockWindow(trustedFileUrl);
    const validEvent = {
      sender: mockWindow.webContents,
      senderFrame: mockWindow.webContents.mainFrame,
    };
    const validOptions = {
      url: 'https://example.com/page',
      allowedOrigin: 'https://example.com',
    };

    it('proves an IPC caller cannot supply customCa to bypass or alter TLS validation', () => {
      expect(() =>
        validateSafeFetchPinnedIpc(
          validEvent,
          { ...validOptions, customCa: '-----BEGIN CERTIFICATE-----\nMOCK_CA\n-----END CERTIFICATE-----' },
          mockWindow
        )
      ).toThrow(/Security violation: customCa, TLS certificate overrides, and test hooks cannot be supplied by IPC callers/i);
    });

    it('proves an IPC caller cannot supply ca, cert, or key TLS options', () => {
      expect(() =>
        validateSafeFetchPinnedIpc(
          validEvent,
          { ...validOptions, ca: 'CERT_STRING' },
          mockWindow
        )
      ).toThrow(/Security violation: customCa, TLS certificate overrides, and test hooks cannot be supplied by IPC callers/i);

      expect(() =>
        validateSafeFetchPinnedIpc(
          validEvent,
          { ...validOptions, cert: 'CLIENT_CERT' },
          mockWindow
        )
      ).toThrow(/Security violation: customCa, TLS certificate overrides, and test hooks cannot be supplied by IPC callers/i);

      expect(() =>
        validateSafeFetchPinnedIpc(
          validEvent,
          { ...validOptions, key: 'PRIVATE_KEY' },
          mockWindow
        )
      ).toThrow(/Security violation: customCa, TLS certificate overrides, and test hooks cannot be supplied by IPC callers/i);
    });

    it('proves an IPC caller cannot disable certificate validation via rejectUnauthorized: false', () => {
      expect(() =>
        validateSafeFetchPinnedIpc(
          validEvent,
          { ...validOptions, rejectUnauthorized: false },
          mockWindow
        )
      ).toThrow(/Security violation: customCa, TLS certificate overrides, and test hooks cannot be supplied by IPC callers/i);
    });

    it('proves an IPC caller cannot supply _testOnlyAllowLoopback to circumvent SSRF guards', () => {
      expect(() =>
        validateSafeFetchPinnedIpc(
          validEvent,
          { ...validOptions, _testOnlyAllowLoopback: true },
          mockWindow
        )
      ).toThrow(/Security violation: customCa, TLS certificate overrides, and test hooks cannot be supplied by IPC callers/i);
    });

    it('proves an IPC caller cannot supply customResolver or customRequester dependency injections', () => {
      expect(() =>
        validateSafeFetchPinnedIpc(
          validEvent,
          { ...validOptions, customResolver: () => {} },
          mockWindow
        )
      ).toThrow(/Security violation: customCa, TLS certificate overrides, and test hooks cannot be supplied by IPC callers/i);

      expect(() =>
        validateSafeFetchPinnedIpc(
          validEvent,
          { ...validOptions, customRequester: () => {} },
          mockWindow
        )
      ).toThrow(/Security violation: customCa, TLS certificate overrides, and test hooks cannot be supplied by IPC callers/i);
    });

    it('proves valid sanitized IPC options strictly exclude any CA or test hook properties', () => {
      const sanitized = validateSafeFetchPinnedIpc(validEvent, validOptions, mockWindow);
      expect(sanitized.url).toBe('https://example.com/page');
      expect(sanitized.allowedOrigin).toBe('https://example.com');
      expect((sanitized as any).customCa).toBeUndefined();
      expect((sanitized as any).ca).toBeUndefined();
      expect((sanitized as any).rejectUnauthorized).toBeUndefined();
      expect((sanitized as any)._testOnlyAllowLoopback).toBeUndefined();
      expect((sanitized as any).customResolver).toBeUndefined();
      expect((sanitized as any).customRequester).toBeUndefined();
    });
  });

  describe('Permission Origin Validation Hardening (Requirement 3)', () => {
    it('allows media and clipboard write permissions for legitimate dev and file origins', () => {
      expect(isPermissionAllowed('media', trustedDevUrl, trustedDevUrl)).toBe(true);
      expect(isPermissionAllowed('clipboard-write', trustedDevUrl, trustedDevUrl)).toBe(true);
      expect(isPermissionAllowed('clipboard-sanitized-write', trustedDevUrl, trustedDevUrl)).toBe(true);

      expect(isPermissionAllowed('media', trustedFileUrl, undefined)).toBe(true);
      expect(isPermissionAllowed('clipboard-write', trustedFileUrl, undefined)).toBe(true);
      expect(isPermissionAllowed('clipboard-sanitized-write', trustedFileUrl, undefined)).toBe(true);
    });

    it('denies unapproved permissions even from legitimate origins', () => {
      expect(isPermissionAllowed('geolocation', trustedDevUrl, trustedDevUrl)).toBe(false);
      expect(isPermissionAllowed('notifications', trustedDevUrl, trustedDevUrl)).toBe(false);
      expect(isPermissionAllowed('camera', trustedDevUrl, trustedDevUrl)).toBe(false);
      expect(isPermissionAllowed('midi', trustedDevUrl, trustedDevUrl)).toBe(false);
      expect(isPermissionAllowed('clipboard-read', trustedDevUrl, trustedDevUrl)).toBe(false);
    });

    it('denies media and clipboard permissions for file URL lookalikes and unapproved files', () => {
      expect(isPermissionAllowed('media', 'file:///tmp/attacker.html', undefined)).toBe(false);
      expect(isPermissionAllowed('media', 'file:///etc/passwd', undefined)).toBe(false);
      expect(isPermissionAllowed('clipboard-write', 'file:///tmp/attacker.html', undefined)).toBe(false);
      expect(isPermissionAllowed('media', `${trustedFileUrl}/../../package.json`, undefined)).toBe(false);
    });

    it('denies permissions for remote file hosts (file://attacker.com/evil.html)', () => {
      expect(isPermissionAllowed('media', 'file://attacker.com/evil.html', undefined)).toBe(false);
      expect(isPermissionAllowed('clipboard-write', 'file://attacker.com/evil.html', undefined)).toBe(false);
    });

    it('denies permissions for dev-server hostname-prefix lookalikes', () => {
      expect(isPermissionAllowed('media', 'http://localhost:5173.attacker.example', trustedDevUrl)).toBe(false);
      expect(isPermissionAllowed('media', 'http://localhost.evil/', trustedDevUrl)).toBe(false);
      expect(isPermissionAllowed('clipboard-write', 'http://localhost:5173.attacker.example', trustedDevUrl)).toBe(false);
    });

    it('denies permissions for different or mismatched ports', () => {
      expect(isPermissionAllowed('media', 'http://localhost:3000', trustedDevUrl)).toBe(false);
      expect(isPermissionAllowed('media', 'http://localhost:5174', trustedDevUrl)).toBe(false);
      expect(isPermissionAllowed('clipboard-write', 'http://localhost:8080', trustedDevUrl)).toBe(false);
    });

    it('denies permissions for credential-embedded URLs', () => {
      expect(isPermissionAllowed('media', 'http://localhost:5173@attacker.example', trustedDevUrl)).toBe(false);
      expect(isPermissionAllowed('media', 'http://admin:secret@localhost:5173/', trustedDevUrl)).toBe(false);
      expect(isPermissionAllowed('clipboard-write', 'http://localhost:5173@attacker.example', trustedDevUrl)).toBe(false);
    });

    it('denies permissions for empty or malformed strings', () => {
      expect(isPermissionAllowed('media', '', trustedDevUrl)).toBe(false);
      expect(isPermissionAllowed('media', '   ', trustedDevUrl)).toBe(false);
      expect(isPermissionAllowed('media', null as any, trustedDevUrl)).toBe(false);
      expect(isPermissionAllowed('media', undefined as any, trustedDevUrl)).toBe(false);
    });
  });
});
