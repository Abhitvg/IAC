import { describe, it, expect } from 'vitest';
import path from 'path';
import { pathToFileURL } from 'url';
import {
  isTrustedSender,
  isTrustedAppOrigin,
  validateSafeFetchPinnedIpc,
  getApprovedAppHtmlPaths,
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
});
