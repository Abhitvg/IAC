import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';

vi.mock('electron', () => ({
  app: { getPath: () => os.tmpdir() },
  safeStorage: {
    isAsyncEncryptionAvailable: vi.fn(),
    encryptStringAsync: vi.fn(),
    decryptStringAsync: vi.fn(),
    getSelectedStorageBackend: vi.fn(),
  },
}));

import { safeStorage } from 'electron';
import { SecurePersistenceStore } from '../electron/services/securePersistenceStore';

describe('SecurePersistenceStore', () => {
  let root: string;
  let store: SecurePersistenceStore;
  const encryptedPrefix = 'os-keyring:';

  beforeEach(() => {
    root = fs.mkdtempSync(path.join(os.tmpdir(), 'iac-secure-persistence-'));
    store = new SecurePersistenceStore(root);
    vi.clearAllMocks();
    (safeStorage.isAsyncEncryptionAvailable as any).mockResolvedValue(true);
    (safeStorage.getSelectedStorageBackend as any).mockReturnValue('gnome_libsecret');
    (safeStorage.encryptStringAsync as any).mockImplementation(async (value: string) =>
      Buffer.from(encryptedPrefix + value, 'utf8')
    );
    (safeStorage.decryptStringAsync as any).mockImplementation(async (value: Buffer) => {
      const text = value.toString('utf8');
      if (!text.startsWith(encryptedPrefix)) throw new Error('authentication failed');
      return { result: text.slice(encryptedPrefix.length), shouldReEncrypt: false };
    });
  });

  afterEach(() => {
    fs.rmSync(root, { recursive: true, force: true });
  });

  it('encrypts and verifies candidate profile data before reporting a durable write', async () => {
    const value = JSON.stringify({ identity: { fullName: 'Test Candidate' } });
    await expect(store.set('candidate-profile', value)).resolves.toBe(true);

    const file = path.join(root, 'secure-persistence', 'candidate-profile.enc');
    const raw = fs.readFileSync(file, 'utf8');
    expect(raw.startsWith('IACSAFE1:')).toBe(true);
    expect(raw).not.toContain('Test Candidate');
    await expect(store.get('candidate-profile')).resolves.toBe(value);
  });

  it('returns null only for a missing record', async () => {
    await expect(store.get('candidate-profile')).resolves.toBeNull();
  });

  it('fails closed for modified or malformed ciphertext instead of returning an empty value', async () => {
    await store.set('candidate-profile', 'sensitive');
    const file = path.join(root, 'secure-persistence', 'candidate-profile.enc');
    fs.writeFileSync(file, 'IACSAFE1:bm90LXZhbGlkLWNpcGhlcnRleHQ=');
    await expect(store.get('candidate-profile')).rejects.toThrow('authentication failed');
  });

  it('rejects an encrypted record whose authenticated plaintext is bound to another namespace', async () => {
    const wrongContext = JSON.stringify({
      format: 'iac-secure-persistence',
      version: 1,
      namespace: 'practice-data',
      value: 'must-not-load',
    });
    const file = path.join(root, 'secure-persistence');
    fs.mkdirSync(file, { recursive: true });
    fs.writeFileSync(
      path.join(file, 'candidate-profile.enc'),
      'IACSAFE1:' + Buffer.from(encryptedPrefix + wrongContext).toString('base64')
    );

    await expect(store.get('candidate-profile')).rejects.toThrow('context mismatch');
  });

  it('does not overwrite the previous encrypted record if verification fails', async () => {
    await store.set('candidate-profile', 'previous-good-value');
    (safeStorage.decryptStringAsync as any).mockRejectedValueOnce(
      new Error('verification unavailable')
    );

    await expect(store.set('candidate-profile', 'replacement-value')).rejects.toThrow(
      'verification unavailable'
    );
    (safeStorage.decryptStringAsync as any).mockImplementation(async (value: Buffer) => {
      const text = value.toString('utf8');
      if (!text.startsWith(encryptedPrefix)) throw new Error('authentication failed');
      return { result: text.slice(encryptedPrefix.length), shouldReEncrypt: false };
    });
    await expect(store.get('candidate-profile')).resolves.toBe('previous-good-value');
  });

  it('fails closed when the OS keyring is unavailable and does not create plaintext files', async () => {
    (safeStorage.isAsyncEncryptionAvailable as any).mockResolvedValue(false);
    await expect(store.set('candidate-profile', 'private-data')).rejects.toThrow(
      /OS keyring is locked or unavailable/
    );
    expect(fs.existsSync(path.join(root, 'secure-persistence'))).toBe(false);
  });

  it('rejects Linux basic_text instead of silently downgrading protection', async () => {
    if (process.platform !== 'linux') return;
    (safeStorage.getSelectedStorageBackend as any).mockReturnValue('basic_text');
    await expect(store.set('candidate-profile', 'private-data')).rejects.toThrow(
      /plaintext fallback is disabled/
    );
  });

  it('rejects unsupported namespaces and oversized values', async () => {
    await expect(store.get('unknown-namespace')).rejects.toThrow(
      'Unsupported secure persistence namespace'
    );
    await expect(store.set('candidate-profile', 'x'.repeat(5 * 1024 * 1024 + 1))).rejects.toThrow(
      'exceeds the 5 MB limit'
    );
  });

  it('re-encrypts a record when Electron reports that the OS key has rotated', async () => {
    await store.set('candidate-profile', 'rotation-value');
    (safeStorage.decryptStringAsync as any).mockResolvedValueOnce({
      result: JSON.stringify({
        format: 'iac-secure-persistence',
        version: 1,
        namespace: 'candidate-profile',
        value: 'rotation-value',
      }),
      shouldReEncrypt: true,
    });
    await expect(store.get('candidate-profile')).resolves.toBe('rotation-value');
    expect(safeStorage.encryptStringAsync).toHaveBeenCalledTimes(2);
  });

  it('rejects symlinked encrypted records instead of following them', async () => {
    if (process.platform === 'win32') return;
    await store.set('candidate-profile', 'private-data');
    const record = path.join(root, 'secure-persistence', 'candidate-profile.enc');
    const outside = path.join(root, 'outside.txt');
    fs.writeFileSync(outside, 'plaintext outside the vault');
    fs.unlinkSync(record);
    fs.symlinkSync(outside, record);

    await expect(store.get('candidate-profile')).rejects.toThrow(
      'Secure persistence record is not a regular file.'
    );
  });

  it('removes only the selected encrypted record', async () => {
    await store.set('candidate-profile', 'private-data');
    await expect(store.remove('candidate-profile')).resolves.toBe(true);
    await expect(store.get('candidate-profile')).resolves.toBeNull();
  });
});
