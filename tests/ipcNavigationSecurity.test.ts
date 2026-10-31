import { describe, it, expect } from 'vitest';
import {
  isTrustedSender,
  isTrustedAppOrigin,
  validateSafeFetchPinnedIpc,
} from '../electron/services/security';

describe('IPC Navigation Security & Sender Validation', () => {
  const trustedDevUrl = 'http://localhost:5173';
  const trustedFileUrl = 'file:///Applications/AI-Interview-Assistant.app/Contents/Resources/app.asar/dist/index.html';

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

  it('allows IPC from legitimate main application frame (dev origin)', () => {
    const mockWindow = createMockWindow(trustedDevUrl);
    const event = {
      sender: mockWindow.webContents,
      senderFrame: mockWindow.webContents.mainFrame,
    };

    expect(isTrustedSender(event, mockWindow, trustedDevUrl)).toBe(true);
  });

  it('allows IPC from legitimate main application frame (file:// production origin)', () => {
    const mockWindow = createMockWindow(trustedFileUrl);
    const event = {
      sender: mockWindow.webContents,
      senderFrame: mockWindow.webContents.mainFrame,
    };

    expect(isTrustedSender(event, mockWindow, undefined)).toBe(true);
  });

  it('rejects IPC when invoked from a subframe / embedded iframe', () => {
    const mockWindow = createMockWindow(trustedFileUrl);
    const subframeEvent = {
      sender: mockWindow.webContents,
      senderFrame: {
        parent: mockWindow.webContents.mainFrame, // Child frame
        url: 'https://untrusted-embed.com/iframe.html',
      },
    };

    expect(isTrustedSender(subframeEvent, mockWindow, undefined)).toBe(false);
  });

  it('rejects IPC when the frame URL is an unexpected external origin', () => {
    const mockWindow = createMockWindow(trustedFileUrl);
    const hostileEvent = {
      sender: mockWindow.webContents,
      senderFrame: {
        parent: null,
        url: 'https://evil-hacker.com/exploit.html',
      },
    };

    expect(isTrustedSender(hostileEvent, mockWindow, undefined)).toBe(false);
  });

  it('rejects IPC when main window was redirected to an untrusted navigation destination', () => {
    // Window has navigated away to an external phishing/malicious page
    const redirectedWindow = createMockWindow('https://malicious-phishing.com/login');
    const event = {
      sender: redirectedWindow.webContents,
      senderFrame: redirectedWindow.webContents.mainFrame,
    };

    expect(isTrustedSender(event, redirectedWindow, trustedDevUrl)).toBe(false);
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

  describe('isTrustedAppOrigin helper', () => {
    it('accepts file:// URLs', () => {
      expect(isTrustedAppOrigin('file:///dist/index.html')).toBe(true);
    });

    it('accepts devServerUrl when configured', () => {
      expect(isTrustedAppOrigin('http://localhost:5173/page', 'http://localhost:5173')).toBe(true);
    });

    it('rejects external or dangerous origins', () => {
      expect(isTrustedAppOrigin('https://example.com')).toBe(false);
      expect(isTrustedAppOrigin('http://localhost:5173', undefined)).toBe(false);
      expect(isTrustedAppOrigin('javascript:alert(1)')).toBe(false);
      expect(isTrustedAppOrigin('data:text/html,bad')).toBe(false);
    });
  });
});

