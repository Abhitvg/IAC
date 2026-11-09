import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { pathToFileURL } from 'url';
import {
  validateReadPath,
  validateWritePath,
  validateDeletePath,
  isPermissionAllowed,
  buildCspHeader,
  getSandboxConfig,
  MAX_WRITE_FILE_SIZE_BYTES,
  isTrustedSender,
  getApprovedAppHtmlPaths,
} from '../../electron/services/security';

describe('Security Hardening & Path Validation', () => {
  const trustedAppFileUrl = pathToFileURL(getApprovedAppHtmlPaths()[0]).href;
  let tempBaseDir: string;
  let userDataDir: string;
  let outsideDir: string;
  let validUserDataFile: string;
  let outsideFile: string;
  let symlinkEscapeFile: string;

  beforeAll(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iac_sec_test_'));
    userDataDir = path.join(tempBaseDir, 'userData');
    outsideDir = path.join(tempBaseDir, 'outside');

    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    validUserDataFile = path.join(userDataDir, 'session_1.json');
    fs.writeFileSync(validUserDataFile, '{"valid": true}');

    outsideFile = path.join(outsideDir, 'secret_resume.pdf');
    fs.writeFileSync(outsideFile, 'resume data');

    // Create a symlink inside userData pointing outside
    symlinkEscapeFile = path.join(userDataDir, 'symlink_escape.txt');
    try {
      fs.symlinkSync(outsideFile, symlinkEscapeFile);
    } catch {
      // If symlink creation fails on certain OS environments without admin, skip symlink test gracefully
    }
  });

  afterAll(() => {
    try {
      fs.rmSync(tempBaseDir, { recursive: true, force: true });
    } catch {}
  });

  describe('Permission Handler Allowlist', () => {
    it('allows media (microphone) for the app file:// origin', () => {
      expect(isPermissionAllowed('media', trustedAppFileUrl)).toBe(true);
    });

    it('allows media for local dev server origin', () => {
      const devUrl = 'http://localhost:5173';
      expect(isPermissionAllowed('media', 'http://localhost:5173/index.html', devUrl)).toBe(true);
    });

    it('denies media for unauthorized external origins', () => {
      expect(isPermissionAllowed('media', 'https://malicious-site.com')).toBe(false);
      expect(isPermissionAllowed('media', 'http://evil.org')).toBe(false);
    });

    it('denies all non-media permissions even from app origin', () => {
      const nonMediaPermissions = [
        'geolocation',
        'notifications',
        'camera',
        'midi',
        'clipboard-read',
        'openExternal',
        'pointerLock',
      ];

      for (const perm of nonMediaPermissions) {
        expect(isPermissionAllowed(perm, trustedAppFileUrl)).toBe(false);
      }
    });
  });

  describe('Read Path Validation (fs:read-file)', () => {
    it('allows reading files inside userData', () => {
      const approved = new Set<string>();
      const result = validateReadPath(validUserDataFile, userDataDir, approved);
      expect(result.allowed).toBe(true);
      expect(result.resolvedPath).toBe(fs.realpathSync(validUserDataFile));
    });

    it('disallows reading files outside userData when not approved via dialog', () => {
      const approved = new Set<string>();
      const result = validateReadPath(outsideFile, userDataDir, approved);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('outside userData and was not approved');
    });

    it('allows reading outside files when explicitly approved in open-file dialog', () => {
      const approved = new Set<string>([fs.realpathSync(outsideFile)]);
      const result = validateReadPath(outsideFile, userDataDir, approved);
      expect(result.allowed).toBe(true);
      expect(result.resolvedPath).toBe(fs.realpathSync(outsideFile));
    });

    it('rejects path traversal attacks using ../ out of userData', () => {
      const approved = new Set<string>();
      const traversalPath = path.join(userDataDir, '..', 'outside', 'secret_resume.pdf');
      const result = validateReadPath(traversalPath, userDataDir, approved);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('outside userData and was not approved');
    });

    it('revokes a file approval when the selected path is replaced by a symlink', () => {
      const selectedPath = path.join(outsideDir, 'selected-after-approval.txt');
      const replacementPath = path.join(outsideDir, 'replacement-target.txt');
      fs.writeFileSync(selectedPath, 'user-approved content');
      fs.writeFileSync(replacementPath, 'different file content');

      // Mirror the main-process dialog handler: approve the real target that
      // existed when the user selected the file.
      const approved = new Set<string>([fs.realpathSync(selectedPath)]);

      try {
        fs.unlinkSync(selectedPath);
        fs.symlinkSync(replacementPath, selectedPath, 'file');
      } catch {
        // Windows runners without symlink privileges cannot exercise retargeting.
        return;
      }

      const result = validateReadPath(selectedPath, userDataDir, approved);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('outside userData and was not approved');
    });

    it('rejects symlinks that point outside userData', () => {
      if (fs.existsSync(symlinkEscapeFile)) {
        const approved = new Set<string>();
        const result = validateReadPath(symlinkEscapeFile, userDataDir, approved);
        expect(result.allowed).toBe(false);
        expect(result.reason).toContain('outside userData and was not approved');
      }
    });

    it('rejects non-existent file paths', () => {
      const approved = new Set<string>();
      const nonExistent = path.join(userDataDir, 'does_not_exist.txt');
      const result = validateReadPath(nonExistent, userDataDir, approved);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('File not found');
    });
  });

  describe('Write Path Validation (fs:write-file)', () => {
    it('allows writing files inside userData', () => {
      const target = path.join(userDataDir, 'notes', 'practice_1.json');
      const result = validateWritePath(target, 1024, userDataDir);
      expect(result.allowed).toBe(true);
    });

    it('rejects writes outside userData', () => {
      const target = path.join(outsideDir, 'hack.txt');
      const result = validateWritePath(target, 100, userDataDir);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Cannot write files outside userData');
    });

    it('rejects overwriting userData root itself', () => {
      const result = validateWritePath(userDataDir, 100, userDataDir);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Cannot overwrite userData root');
    });

    it('enforces maximum file size limit (25 MB)', () => {
      const target = path.join(userDataDir, 'large.bin');
      const oversized = MAX_WRITE_FILE_SIZE_BYTES + 1;
      const result = validateWritePath(target, oversized, userDataDir);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('exceeds maximum allowed size');
    });
  });

  describe('Delete Path Validation (fs:delete)', () => {
    it('allows deleting existing files inside userData', () => {
      const toDelete = path.join(userDataDir, 'temp_to_delete.txt');
      fs.writeFileSync(toDelete, 'temp');
      const result = validateDeletePath(toDelete, userDataDir);
      expect(result.allowed).toBe(true);
      expect(result.resolvedPath).toBe(fs.realpathSync(toDelete));
    });

    it('rejects deleting userData root', () => {
      const result = validateDeletePath(userDataDir, userDataDir);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Cannot delete userData root');
    });

    it('rejects deleting files outside userData', () => {
      const result = validateDeletePath(outsideFile, userDataDir);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('Cannot delete path outside userData');
    });
  });

  describe('Content Security Policy & Sandbox', () => {
    it('generates strict Content-Security-Policy header in production', () => {
      const csp = buildCspHeader(false);
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("object-src 'none'");
      expect(csp).toContain("frame-ancestors 'none'");
      expect(csp).not.toContain("'unsafe-eval'");
    });

    it('enforces sandbox: true for production builds', () => {
      const prodSandbox = getSandboxConfig(true);
      expect(prodSandbox).toBe(true);

      const devSandbox = getSandboxConfig(false);
      expect(devSandbox).toBe(false);
    });
  });
});

describe('IPC sender identity validation', () => {
  const trustedUrl = 'http://localhost:5173/index.html';

  function createWindow() {
    const mainFrame = { parent: null, url: trustedUrl };
    const webContents = {
      mainFrame,
      isDestroyed: () => false,
      getURL: () => trustedUrl,
    };
    return {
      mainFrame,
      webContents,
      isDestroyed: () => false,
    };
  }

  it('accepts only the exact trusted main frame and WebContents', () => {
    const window = createWindow();
    expect(
      isTrustedSender(
        { sender: window.webContents, senderFrame: window.mainFrame },
        window,
        'http://localhost:5173'
      )
    ).toBe(true);
  });

  it('rejects missing sender or sender frame metadata', () => {
    const window = createWindow();
    expect(
      isTrustedSender({ senderFrame: window.mainFrame }, window, 'http://localhost:5173')
    ).toBe(false);
    expect(isTrustedSender({ sender: window.webContents }, window, 'http://localhost:5173')).toBe(
      false
    );
  });

  it('rejects foreign WebContents, subframes, and mismatched frame URLs', () => {
    const window = createWindow();
    expect(
      isTrustedSender(
        { sender: {}, senderFrame: window.mainFrame },
        window,
        'http://localhost:5173'
      )
    ).toBe(false);
    expect(
      isTrustedSender(
        {
          sender: window.webContents,
          senderFrame: { parent: window.mainFrame, url: trustedUrl },
        },
        window,
        'http://localhost:5173'
      )
    ).toBe(false);
    expect(
      isTrustedSender(
        {
          sender: window.webContents,
          senderFrame: { parent: null, url: 'https://attacker.example' },
        },
        window,
        'http://localhost:5173'
      )
    ).toBe(false);
  });

  it('rejects a navigated current document even if the event frame was trusted', () => {
    const window = createWindow();
    window.webContents.getURL = () => 'https://attacker.example';
    expect(
      isTrustedSender(
        { sender: window.webContents, senderFrame: window.mainFrame },
        window,
        'http://localhost:5173'
      )
    ).toBe(false);
  });
});
