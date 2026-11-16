import { afterEach, describe, expect, it } from 'vitest';
import crypto from 'crypto';
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
    decryptStringAsync: async (value) => ({
      result: value.toString('utf8'),
      shouldReEncrypt: false,
    }),
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
    const recordDigest = crypto
      .createHash('sha256')
      .update('session_123', 'utf8')
      .digest('hex');
    const file = path.join(directory, recordDigest + '.json');
    expect(fs.readFileSync(file, 'utf8')).not.toContain('private interview answer');
    await expect(store.get('interview-sessions', 'session_123')).resolves.toBe(secret);
  });

  it('lists only authenticated records and removes deleted identifiers', async () => {
    const store = createStore();
    await store.set('interview-sessions', 'session_a', 'first');
    await store.set('interview-sessions', 'session_b', 'second');
    expect(await store.list('interview-sessions')).toEqual(['session_a', 'session_b']);
    await store.delete('interview-sessions', 'session_a');
    expect(await store.list('interview-sessions')).toEqual(['session_b']);
  });

  it('repairs stale identifiers when indexed record files are missing', async () => {
    const store = createStore();
    await store.set('practice', 'answer_missing', 'first');
    await store.set('practice', 'answer_present', 'second');

    const directory = path.join(rootDir, 'records', 'practice');
    const missingDigest = crypto
      .createHash('sha256')
      .update('answer_missing', 'utf8')
      .digest('hex');
    fs.unlinkSync(path.join(directory, missingDigest + '.json'));

    await expect(store.list('practice')).resolves.toEqual(['answer_present']);
    await expect(store.list('practice')).resolves.toEqual(['answer_present']);
  });

  it('preserves concurrent record identifiers in the encrypted index', async () => {
    const store = createStore();
    await Promise.all(
      Array.from({ length: 12 }, (_, index) =>
        store.set('practice', 'answer_' + index, 'value_' + index)
      )
    );
    expect(await store.list('practice')).toHaveLength(12);
  });

  it('does not leave an unindexed record when index persistence fails', async () => {
    const store = createStore();
    const originalWriteRecord = (store as any).writeRecord.bind(store);
    (store as any).writeRecord = async (
      namespace: string,
      id: string,
      plaintext: string
    ) => {
      if (id === '__index__') throw new Error('simulated index write failure');
      return originalWriteRecord(namespace, id, plaintext);
    };

    await expect(store.set('practice', 'answer_orphan', 'secret')).rejects.toThrow(
      'simulated index write failure'
    );

    const directory = path.join(rootDir, 'records', 'practice');
    const digest = crypto
      .createHash('sha256')
      .update('answer_orphan', 'utf8')
      .digest('hex');
    expect(fs.existsSync(path.join(directory, digest + '.json'))).toBe(false);
    await expect(store.list('practice')).resolves.toEqual([]);
  });

  it('authenticates the namespace and identifier as associated data', async () => {
    const store = createStore();
    await store.set('candidate-vault', 'candidate_1', 'private');
    await expect(store.get('candidate-vault', 'candidate_2')).resolves.toBeNull();

    const directory = path.join(rootDir, 'records', 'candidate-vault');
    const sourceDigest = crypto
      .createHash('sha256')
      .update('candidate_1', 'utf8')
      .digest('hex');
    const source = path.join(directory, sourceDigest + '.json');
    const targetDirectory = path.join(rootDir, 'records', 'practice');
    fs.mkdirSync(targetDirectory, { recursive: true });
    fs.copyFileSync(source, path.join(targetDirectory, sourceDigest + '.json'));

    await expect(store.get('practice', 'candidate_1')).rejects.toThrow('authentication failed');
  });

  it('rejects tampered ciphertext', async () => {
    const store = createStore();
    await store.set('practice', 'answer_1', 'private');

    const directory = path.join(rootDir, 'records', 'practice');
    const recordDigest = crypto
      .createHash('sha256')
      .update('answer_1', 'utf8')
      .digest('hex');
    const file = path.join(directory, recordDigest + '.json');
    const envelope = JSON.parse(fs.readFileSync(file, 'utf8'));
    envelope.ciphertext = Buffer.from('tampered').toString('base64');
    fs.writeFileSync(file, JSON.stringify(envelope));

    await expect(store.get('practice', 'answer_1')).rejects.toThrow('authentication failed');
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

    await expect(store.set('../outside' as never, 'id', 'secret')).rejects.toThrow(
      'Invalid secure record'
    );
    await expect(store.set('practice', '../escape', 'secret')).rejects.toThrow(
      'Invalid secure record'
    );
    await expect(store.set('practice', 'large', 'x'.repeat(5 * 1024 * 1024 + 1))).rejects.toThrow(
      '5 MiB'
    );
  });
});
