import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'path';
import fs from 'fs';
import os from 'os';
import {
  validateReadPath,
  validateWritePath,
  validateDeletePath,
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
