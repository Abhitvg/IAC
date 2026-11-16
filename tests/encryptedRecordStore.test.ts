import { afterEach, describe, expect, it } from 'vitest';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {
  EncryptedRecordStore,
  type SecureStorageAdapter,
} from '../electron/services/encryptedRecordStore';

describe('EncryptedRecordStore', () => {
  let rootDir = '';

  const storage: SecureStorageAdapter = {
    isAsyncEncryptionAvailable: async () => true,
    getSelectedStorageBackend: () => 'gnome_libsecret',
    encryptStringAsync: async (value) => Buffer.from(value, 'utf8'),
    decryptStringAsync: async (value) => value.toString('utf8'),
  };

  afterEach(() => {
    if (rootDir) fs.rmSync(rootDir, { recursive: true, force: true });
  });

  function createStore(platform = 'linux') {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iac-encrypted-records-'));
    return new EncryptedRecordStore({ rootDir, storage, platform });
  }

  it('stores ciphertext and round-trips plaintext', async () => {
    const store = createStore();
    const secret = JSON.stringify({ answer: 'private interview answer' });
    await store.set('interview-sessions', 'session_123', secret);

    const directory = path.join(rootDir, 'records', 'interview-sessions');
    const file = path.join(directory, fs.readdirSync(directory)[0]);
    expect(fs.readFileSync(file, 'utf8')).not.toContain('private interview answer');
    await expect(store.get('interview-sessions', 'session_123')).resolves.toBe(secret);
  });

  it('authenticates the namespace and identifier as associated data', async () => {
    const store = createStore();
    await store.set('candidate-vault', 'candidate_1', 'private');
    await expect(store.get('candidate-vault', 'candidate_2')).resolves.toBeNull();

    const directory = path.join(rootDir, 'records', 'candidate-vault');
    const source = path.join(directory, fs.readdirSync(directory)[0]);
    const targetDirectory = path.join(rootDir, 'records', 'practice');
    fs.mkdirSync(targetDirectory, { recursive: true });
    fs.copyFileSync(source, path.join(targetDirectory, fs.readdirSync(directory)[0]));

    await expect(store.get('practice', 'candidate_1')).rejects.toThrow(
      'authentication failed'
    );
  });

  it('rejects tampered ciphertext', async () => {
    const store = createStore();
    await store.set('practice', 'answer_1', 'private');

    const directory = path.join(rootDir, 'records', 'practice');
    const file = path.join(directory, fs.readdirSync(directory)[0]);
    const envelope = JSON.parse(fs.readFileSync(file, 'utf8'));
    envelope.ciphertext = Buffer.from('tampered').toString('base64');
    fs.writeFileSync(file, JSON.stringify(envelope));

    await expect(store.get('practice', 'answer_1')).rejects.toThrow(
      'authentication failed'
    );
  });

  it('fails closed when Linux has no OS-backed keyring', async () => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'iac-no-keyring-'));
    const noKeyring = {
      ...storage,
      getSelectedStorageBackend: () => 'basic_text',
    };
    const store = new EncryptedRecordStore({
      rootDir,
      platform: 'linux',
      storage: noKeyring,
    });

    await expect(store.set('practice', 'answer_1', 'secret')).rejects.toThrow(
      'no plaintext fallback'
    );
  });

  it('rejects invalid namespaces, identifiers and oversized payloads', async () => {
    const store = createStore('darwin');

    await expect(
      store.set('../outside' as never, 'id', 'secret')
    ).rejects.toThrow('Invalid secure record');
    await expect(
      store.set('practice', '../escape', 'secret')
    ).rejects.toThrow('Invalid secure record');
    await expect(
      store.set('practice', 'large', 'x'.repeat(5 * 1024 * 1024 + 1))
    ).rejects.toThrow('5 MiB');
  });
});
