import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  validateReadPath,
  validateWritePath,
  validateDeletePath,
  createPublicSettingsSnapshot,
  createExtensionTokenInfo,
} from '../electron/services/security';

describe('Electron Security & Path Traversal Audit', () => {
  let tempBaseDir: string;
  let userDataDir: string;
  let outsideDir: string;
  let validUserDataFile: string;
  let outsideFile: string;

  beforeAll(() => {
    tempBaseDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iac_audit_test_'));
    userDataDir = path.join(tempBaseDir, 'userData');
    outsideDir = path.join(tempBaseDir, 'outside');

    fs.mkdirSync(userDataDir, { recursive: true });
    fs.mkdirSync(outsideDir, { recursive: true });

    validUserDataFile = path.join(userDataDir, 'audio.wav');
    fs.writeFileSync(validUserDataFile, 'RIFF mock audio');

    outsideFile = path.join(outsideDir, 'resume.pdf');
    fs.writeFileSync(outsideFile, 'mock pdf');
  });

  afterAll(() => {
    try {
      fs.rmSync(tempBaseDir, { recursive: true, force: true });
    } catch {}
  });

  it('returns only allowlisted public settings and strips sensitive values', () => {
    const settings = {
      aiProvider: 'groq',
      theme: 'dark',
      extensionToken: 'extension-secret',
      secure_credentials: { groq: { data: 'encrypted-record' } },
      apiKey: 'provider-secret',
      unexpectedSecret: 'must-not-cross-ipc',
    };

    const snapshot = createPublicSettingsSnapshot(
      settings,
      new Set(['aiProvider', 'theme', 'extensionToken', 'secure_credentials', 'apiKey'])
    );

    expect(snapshot).toEqual({ aiProvider: 'groq', theme: 'dark' });
    expect(settings.extensionToken).toBe('extension-secret');
  });

  it('does not retrieve cloud STT API keys in the renderer', () => {
    const whisperService = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/whisper.ts'),
      'utf8'
    );

    expect(whisperService).not.toMatch(/getApiKey\(/);
    expect(whisperService).not.toMatch(/VITE_(?:GROQ|OPENAI)_API_KEY/);
    expect(whisperService).toContain('transcribeCloudAudio');
  });

  it('does not load saved API keys into the Settings renderer', () => {
    const settingsPanel = fs.readFileSync(
      path.resolve(process.cwd(), 'src/components/SettingsPanel.tsx'),
      'utf8'
    );

    expect(settingsPanel).not.toMatch(/getApiKey\(/);
    expect(settingsPanel).toContain('hasApiKey(');
    expect(settingsPanel).toContain('preflightAI');
  });

  it('returns only a masked extension token preview across IPC', () => {
    const token = '12345678-1234-1234-1234-1234567890ab';
    const info = createExtensionTokenInfo(31415, token);

    expect(info).toEqual({ port: 31415, tokenPreview: '90ab' });
    expect(info).not.toHaveProperty('token');
    expect(JSON.stringify(info)).not.toContain(token);
  });

  it('uses the safe extension token response for every WebSocket startup path', () => {
    const handlers = fs.readFileSync(
      path.resolve(process.cwd(), 'electron/ipc/handlers.ts'),
      'utf8'
    );
    const start = handlers.indexOf("ipcMain.handle('ws:get-info'");
    const end = handlers.indexOf('// Privileged Evidence Inspection Handlers', start);
    const wsHandlers = handlers.slice(start, end);

    expect(wsHandlers.match(/createExtensionTokenInfo\(/g)).toHaveLength(3);
    expect(wsHandlers).not.toMatch(/return\s*\{\s*port\s*:\s*31415\s*,\s*token\s*\}/);
    expect(wsHandlers).not.toMatch(/return\s*\{\s*port\s*,\s*token\s*\}/);
  });

  it('allows read path inside userData', () => {
    const approvedPaths = new Set<string>();
    const result = validateReadPath(validUserDataFile, userDataDir, approvedPaths);
    expect(result.allowed).toBe(true);
    expect(result.resolvedPath).toBe(fs.realpathSync(validUserDataFile));
  });

  it('allows read path explicitly approved in file dialog', () => {
    const approvedPaths = new Set<string>([fs.realpathSync(outsideFile)]);
    const result = validateReadPath(outsideFile, userDataDir, approvedPaths);
    expect(result.allowed).toBe(true);
    expect(result.resolvedPath).toBe(fs.realpathSync(outsideFile));
  });

  it('blocks arbitrary read paths outside approved locations', () => {
    const approvedPaths = new Set<string>();
    const forbidden = '/etc/passwd';
    const result = validateReadPath(forbidden, userDataDir, approvedPaths);
    expect(result.allowed).toBe(false);
  });

  it('blocks path traversal attack attempting escape from userData', () => {
    const approvedPaths = new Set<string>();
    const traversal = path.join(userDataDir, '..', 'outside', 'resume.pdf');
    const result = validateReadPath(traversal, userDataDir, approvedPaths);
    expect(result.allowed).toBe(false);
  });

  it('blocks write path outside userData', () => {
    const writeTarget = path.join(outsideDir, 'malicious.sh');
    const result = validateWritePath(writeTarget, 100, userDataDir);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Cannot write files outside userData');
  });

  it('blocks writes exceeding maximum byte limits', () => {
    const writeTarget = path.join(userDataDir, 'huge.bin');
    const overLimit = 30 * 1024 * 1024; // 30MB (limit is 25MB)
    const result = validateWritePath(writeTarget, overLimit, userDataDir);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('exceeds maximum allowed');
  });

  it('blocks dangling symlinks that could create files outside userData', () => {
    const danglingLink = path.join(userDataDir, 'dangling-outside-link.txt');
    const externalTarget = path.join(outsideDir, 'created-by-symlink.txt');

    try {
      fs.symlinkSync(externalTarget, danglingLink);
    } catch {
      // Some Windows environments require elevated symlink privileges.
      return;
    }

    expect(fs.existsSync(danglingLink)).toBe(false);
    expect(fs.lstatSync(danglingLink).isSymbolicLink()).toBe(true);

    const result = validateWritePath(danglingLink, 32, userDataDir);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Destination is a symbolic link');
    expect(fs.existsSync(externalTarget)).toBe(false);
  });

  it('blocks delete path outside userData', () => {
    const deleteTarget = outsideFile;
    const result = validateDeletePath(deleteTarget, userDataDir);
    expect(result.allowed).toBe(false);
    expect(result.reason).toContain('Cannot delete path outside userData');
  });

  it('listener cleanup removes only the specific listener and preserves sibling listeners', () => {
    const listeners = new Map<string, Set<Function>>();

    const mockIpcRenderer = {
      on: (channel: string, fn: Function) => {
        if (!listeners.has(channel)) listeners.set(channel, new Set());
        listeners.get(channel)!.add(fn);
      },
      removeListener: (channel: string, fn: Function) => {
        listeners.get(channel)?.delete(fn);
      },
    };

    const cb1 = vi.fn();
    const cb2 = vi.fn();

    // Register two listeners on same channel
    mockIpcRenderer.on('browser-context', cb1);
    mockIpcRenderer.on('browser-context', cb2);
    expect(listeners.get('browser-context')!.size).toBe(2);

    // Unsubscribe only cb1
    mockIpcRenderer.removeListener('browser-context', cb1);
    expect(listeners.get('browser-context')!.size).toBe(1);
    expect(listeners.get('browser-context')!.has(cb2)).toBe(true);
    expect(listeners.get('browser-context')!.has(cb1)).toBe(false);
  });
});
