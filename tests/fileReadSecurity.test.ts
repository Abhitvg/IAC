import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { readFileSafely } from '../electron/services/security';

describe('readFileSafely', () => {
  let rootDir: string;
  let userDataDir: string;
  let externalDir: string;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iac-file-read-'));
    userDataDir = path.join(rootDir, 'user-data');
    externalDir = path.join(rootDir, 'external');
    fs.mkdirSync(userDataDir);
    fs.mkdirSync(externalDir);
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  it('reads regular files inside the application user-data directory', () => {
    const filePath = path.join(userDataDir, 'session.json');
    fs.writeFileSync(filePath, '{"ok":true}');

    expect(readFileSafely(filePath, userDataDir, new Set()).toString('utf8')).toBe(
      '{"ok":true}'
    );
  });

  it('reads an external file only when its canonical path was approved', () => {
    const filePath = path.join(externalDir, 'resume.txt');
    fs.writeFileSync(filePath, 'approved resume');
    const approvedPaths = new Set([fs.realpathSync(filePath)]);

    expect(readFileSafely(filePath, userDataDir, approvedPaths).toString('utf8')).toBe(
      'approved resume'
    );
  });

  it('rejects external files that were not approved by the file dialog', () => {
    const filePath = path.join(externalDir, 'private.txt');
    fs.writeFileSync(filePath, 'private');

    expect(() => readFileSafely(filePath, userDataDir, new Set())).toThrow(/access denied/i);
  });

  it('enforces the read-size limit while consuming the file descriptor', () => {
    const filePath = path.join(userDataDir, 'large.txt');
    fs.writeFileSync(filePath, '0123456789');

    expect(() => readFileSafely(filePath, userDataDir, new Set(), 8)).toThrow(
      /maximum allowed read size/i
    );
  });

  it('rejects symbolic links that resolve outside user-data', () => {
    const externalFile = path.join(externalDir, 'outside.txt');
    const linkPath = path.join(userDataDir, 'outside-link.txt');
    fs.writeFileSync(externalFile, 'outside');

    try {
      fs.symlinkSync(externalFile, linkPath);
    } catch {
      return;
    }

    expect(() => readFileSafely(linkPath, userDataDir, new Set())).toThrow(/access denied/i);
  });
});
