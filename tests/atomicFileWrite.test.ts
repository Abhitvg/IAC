import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { writeFileAtomically } from '../electron/services/security';

describe('atomic user-data file writes', () => {
  let root = '';

  afterEach(() => {
    if (root) fs.rmSync(root, { recursive: true, force: true });
    root = '';
  });

  it('replaces an existing file with the complete new payload', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'iac-atomic-write-'));
    const target = path.join(root, 'sessions', 'session.json');
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target, 'old partial data', 'utf8');

    writeFileAtomically(target, JSON.stringify({ questions: ['new answer'] }), root);

    expect(JSON.parse(fs.readFileSync(target, 'utf8'))).toEqual({
      questions: ['new answer'],
    });
    expect(fs.readdirSync(path.dirname(target))).toEqual(['session.json']);
  });

  it('rejects paths outside userData without modifying the existing target', () => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'iac-atomic-write-'));
    const outside = path.join(os.tmpdir(), 'iac-outside-' + Date.now() + '.json');
    fs.writeFileSync(outside, 'keep me', 'utf8');

    try {
      expect(() => writeFileAtomically(outside, 'overwrite', root)).toThrow(
        'Cannot write files outside userData'
      );
      expect(fs.readFileSync(outside, 'utf8')).toBe('keep me');
    } finally {
      fs.rmSync(outside, { force: true });
    }
  });
});
