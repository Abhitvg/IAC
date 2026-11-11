import fs from 'fs';
import os from 'os';
import path from 'path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('electron', () => ({
  safeStorage: {
    isAsyncEncryptionAvailable: vi.fn(),
    encryptStringAsync: vi.fn(),
    decryptStringAsync: vi.fn(),
    getSelectedStorageBackend: vi.fn(),
  },
}));

import { safeStorage } from 'electron';
import { PiiVault } from '../electron/services/piiVault';

describe('PiiVault', () => {
  let userDataPath: string;

  beforeEach(() => {
    userDataPath = fs.mkdtempSync(path.join(os.tmpdir(), 'iac-pii-vault-'));
    vi.clearAllMocks();
    (safeStorage.isAsyncEncryptionAvailable as any).mockResolvedValue(true);
    (safeStorage.getSelectedStorageBackend as any).mockReturnValue('gnome_libsecret');
    (safeStorage.encryptStringAsync as any).mockImplementation(async (value: string) =>
      Buffer.from(`os-keyring:${value}`)
    );
    (safeStorage.decryptStringAsync as any).mockImplementation(async (value: Buffer) => {
      const text = value.toString();
      if (!text.startsWith('os-keyring:')) throw new Error('OS keyring authentication failed');
      return { result: text.slice('os-keyring:'.length), shouldReEncrypt: false };
    });
  });

  afterEach(() => {
    fs.rmSync(userDataPath, { recursive: true, force: true });
  });

  it(
    'creates a random OS-wrapped key and stores authenticated ciphertext, not plaintext',
    async () => {
      const vault = new PiiVault(userDataPath);
      const profile = { fullName: 'Private Candidate', email: 'private@example.test' };

      await vault.put('candidate', 'profile', profile);

      const recordPath = path.join(userDataPath, 'pii-vault', 'candidate', 'profile.json.enc');
      const raw = fs.readFileSync(recordPath, 'utf8');
      expect(raw).not.toContain('Private Candidate');
      expect(raw).not.toContain('private@example.test');
      if (process.platform !== 'win32') {
        expect(fs.statSync(recordPath).mode & 0o777).toBe(0o600);
      }

      const keyRecord = JSON.parse(
        fs.readFileSync(path.join(userDataPath, '.iac-pii-vault-key.v1'), 'utf8')
      );
      expect(keyRecord.version).toBe(1);
      expect(Buffer.from(keyRecord.data, 'base64url').toString()).not.toContain(
        'Private Candidate'
      );
      await expect(vault.get('candidate', 'profile')).resolves.toEqual(profile);
    });
  );
    }
  it('binds ciphertext to namespace and record key', async () => {
    const vault = new PiiVault(userDataPath);
    await vault.put('candidate', 'profile', { email: 'private@example.test' });

    const source = path.join(userDataPath, 'pii-vault', 'candidate', 'profile.json.enc');
    const destination = path.join(userDataPath, 'pii-vault', 'practice');
    fs.mkdirSync(destination, { recursive: true });
    fs.renameSync(source, path.join(destination, 'profile.json.enc'));

    await expect(vault.get('practice', 'profile')).rejects.toThrow(
      'PII vault authentication failed'
    );
  });

  it('fails closed on tampered ciphertext and preserves the damaged record', async () => {
    const vault = new PiiVault(userDataPath);
    await vault.put('practice', 'feedback', { transcript: 'private answer' });
    const recordPath = path.join(userDataPath, 'pii-vault', 'practice', 'feedback.json.enc');
    const record = JSON.parse(fs.readFileSync(recordPath, 'utf8'));
    const ciphertext = Buffer.from(record.ciphertext, 'base64url');
    ciphertext[0] ^= 1;
    record.ciphertext = ciphertext.toString('base64url');
    fs.writeFileSync(recordPath, JSON.stringify(record));

    await expect(vault.get('practice', 'feedback')).rejects.toThrow(
      'PII vault authentication failed'
    );
    expect(fs.existsSync(recordPath)).toBe(true);
  });

  it('does not generate a replacement key when the existing wrapped key is corrupt', async () => {
    const keyPath = path.join(userDataPath, '.iac-pii-vault-key.v1');
    fs.writeFileSync(keyPath, '{broken');
    const vault = new PiiVault(userDataPath);

    await expect(
      vault.put('candidate', 'profile', { email: 'private@example.test' })
    ).rejects.toThrow('PII vault key metadata is corrupt');
    expect(safeStorage.encryptStringAsync).not.toHaveBeenCalled();
    expect(fs.readFileSync(keyPath, 'utf8')).toBe('{broken');
  });

  it(
    'does not create a replacement key when encrypted records exist but the key file is missing',
      async () => {
      const vault = new PiiVault(userDataPath);
      await vault.put('candidate', 'profile', { fullName: 'Private Candidate' });
      const keyPath = path.join(userDataPath, '.iac-pii-vault-key.v1');
      const recordPath = path.join(userDataPath, 'pii-vault', 'candidate', 'profile.json.enc');
      const encryptedRecord = fs.readFileSync(recordPath, 'utf8');
      fs.unlinkSync(keyPath);

      const restartedVault = new PiiVault(userDataPath);
      await expect(
        restartedVault.put('candidate', 'other-profile', { fullName: 'Another Candidate' })
      ).rejects.toThrow(/master key is missing while encrypted records exist/);
      expect(fs.existsSync(keyPath)).toBe(false);
      expect(fs.readFileSync(recordPath, 'utf8')).toBe(encryptedRecord);
  );
    }

  it('refuses access when the OS keyring is unavailable or locked', async () => {
    (safeStorage.isAsyncEncryptionAvailable as any).mockResolvedValue(false);
    const vault = new PiiVault(userDataPath);

    await expect(
      vault.put('candidate', 'profile', { email: 'private@example.test' })
    ).rejects.toThrow(/OS-backed encryption is unavailable or locked/);
    expect(fs.existsSync(path.join(userDataPath, '.iac-pii-vault-key.v1'))).toBe(false);
  });

  it('rejects Linux basic_text instead of using an unprotected keyring backend', async () => {
    if (process.platform !== 'linux') return;
    (safeStorage.getSelectedStorageBackend as any).mockReturnValue('basic_text');
    const vault = new PiiVault(userDataPath);

    await expect(
      vault.put('candidate', 'profile', { email: 'private@example.test' })
    ).rejects.toThrow(/Secure Linux keyring is unavailable/);
  });

  it('rewraps the master key when Electron reports key rotation', async () => {
    const vault = new PiiVault(userDataPath);
    await vault.put('candidate', 'profile', { fullName: 'Private Candidate' });
    const keyPath = path.join(userDataPath, '.iac-pii-vault-key.v1');
    const first = fs.readFileSync(keyPath, 'utf8');
    const keyRecord = JSON.parse(first);
    const masterKeyBase64 = Buffer.from(keyRecord.data, 'base64url')
      .toString()
      .slice('os-keyring:'.length);
    (safeStorage.decryptStringAsync as any).mockResolvedValueOnce({
      result: masterKeyBase64,
      shouldReEncrypt: true,
    });
    (safeStorage.encryptStringAsync as any).mockResolvedValueOnce(
      Buffer.from(`rotated-keyring:${masterKeyBase64}`)
    );
    // A fresh vault instance forces the persisted wrapped key to be read again.
    const secondVault = new PiiVault(userDataPath);
    await expect(secondVault.get('candidate', 'profile')).resolves.toEqual({
      fullName: 'Private Candidate',
    });
    expect(fs.readFileSync(keyPath, 'utf8')).not.toBe(first);
  });

  it('verifies a migrated value before the caller removes its plaintext source', async () => {
    const vault = new PiiVault(userDataPath);
    const legacy = { transcript: 'legacy private transcript', score: 4 };

    await vault.put('practice', 'session-history', legacy);

    await expect(vault.verify('practice', 'session-history', legacy)).resolves.toBe(true);
    await expect(
      vault.verify('practice', 'session-history', { ...legacy, score: 5 })
    ).resolves.toBe(false);
  });

  it('rejects path traversal and unsupported namespaces', async () => {
    const vault = new PiiVault(userDataPath);

    await expect(vault.put('../candidate', 'profile', {})).rejects.toThrow(
      'Unsupported PII vault namespace'
    );
    await expect(vault.put('candidate', '../profile', {})).rejects.toThrow(
      'Invalid PII vault record key'
    );
  });

  it('rejects non-JSON values and oversized records', async () => {
    const vault = new PiiVault(userDataPath);

    await expect(vault.put('candidate', 'undefined', undefined)).rejects.toThrow(
      'JSON-serializable'
    );
    await expect(vault.put('candidate', 'large', 'x'.repeat(10 * 1024 * 1024 + 1))).rejects.toThrow(
      '10 MiB limit'
    );
  });

  it('wipes the cached master key and rejects operations after close', async () => {
    const vault = new PiiVault(userDataPath);
    await vault.put('candidate', 'profile', { fullName: 'Private Candidate' });

    vault.close();

    await expect(vault.get('candidate', 'profile')).rejects.toThrow('PII vault is closed.');
    expect(() => vault.close()).not.toThrow();
  });

  it('returns null for missing records and deletes existing records', async () => {
    const vault = new PiiVault(userDataPath);

    await expect(vault.get('sessions', 'history')).resolves.toBeNull();
    await vault.put('sessions', 'history', [{ transcript: 'private' }]);
    await expect(vault.delete('sessions', 'history')).resolves.toBe(true);
    await expect(vault.delete('sessions', 'history')).resolves.toBe(false);
    await expect(vault.get('sessions', 'history')).resolves.toBeNull();
  });
});
