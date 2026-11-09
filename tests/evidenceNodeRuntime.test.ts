import { afterEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ProtectedEvidenceKeyManager,
  sha256Hex,
} from '../src/services/evidenceInspection';

describe('Evidence inspection Node runtime adapter', () => {
  afterEach(() => {
    ProtectedEvidenceKeyManager.resetKeyStore();
  });

  it('loads Node built-ins without dynamic eval and preserves evidence key persistence', () => {
    const nodeProcess = (globalThis as any).process;
    expect(typeof nodeProcess?.getBuiltinModule).toBe('function');
    expect(nodeProcess.getBuiltinModule('node:fs')).toBeDefined();
    expect(nodeProcess.getBuiltinModule('node:crypto')).toBeDefined();

    const sample = 'evidence-integrity-check';
    expect(sha256Hex(sample)).toBe(crypto.createHash('sha256').update(sample).digest('hex'));

    const tempDirectory = fs.mkdtempSync(path.join(os.tmpdir(), 'iac-evidence-runtime-'));
    const storagePath = path.join(tempDirectory, 'evidence-keys.json');
    const secretHex = 'ab'.repeat(32);
    const keyId = 'runtime-loader-test-key';

    try {
      ProtectedEvidenceKeyManager.resetKeyStore(secretHex, keyId);
      ProtectedEvidenceKeyManager.saveToDisk(storagePath);

      expect(fs.existsSync(storagePath)).toBe(true);
      ProtectedEvidenceKeyManager.resetKeyStore('cd'.repeat(32), 'different-key');
      expect(ProtectedEvidenceKeyManager.loadFromDisk(storagePath)).toBe(true);
      expect(ProtectedEvidenceKeyManager.getActiveKeyId()).toBe(keyId);
      expect(Buffer.from(ProtectedEvidenceKeyManager.getActiveSecret()).toString('hex')).toBe(
        secretHex
      );
    } finally {
      fs.rmSync(tempDirectory, { recursive: true, force: true });
    }
  });

  it('fails closed instead of generating evidence secrets with Math.random', () => {
    const previousWindow = Object.getOwnPropertyDescriptor(globalThis, 'window');
    const previousCrypto = Object.getOwnPropertyDescriptor(globalThis, 'crypto');

    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      value: {},
    });
    Object.defineProperty(globalThis, 'crypto', {
      configurable: true,
      value: undefined,
    });

    try {
      expect(() => ProtectedEvidenceKeyManager.rotateKey()).toThrow(
        'Cryptographically secure random number generation is unavailable.'
      );
    } finally {
      if (previousWindow) {
        Object.defineProperty(globalThis, 'window', previousWindow);
      } else {
        Reflect.deleteProperty(globalThis, 'window');
      }
      if (previousCrypto) {
        Object.defineProperty(globalThis, 'crypto', previousCrypto);
      } else {
        Reflect.deleteProperty(globalThis, 'crypto');
      }
    }
  });
});
