import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock Electron before importing CredentialStore.
vi.mock('electron', () => ({
  app: {
    getPath: () => os.tmpdir(),
  },
  safeStorage: {
    isAsyncEncryptionAvailable: vi.fn(),
    encryptStringAsync: vi.fn(),
    decryptStringAsync: vi.fn(),
    getSelectedStorageBackend: vi.fn(),
  },
}));

import { safeStorage } from 'electron';
import { CredentialStore } from '../electron/services/credentialStore';

class MockStore {
  private data: Record<string, any> = {};

  get(key: string, defaultValue?: any) {
    return this.data[key] !== undefined ? this.data[key] : defaultValue;
  }

  set(key: string, value: any) {
    this.data[key] = value;
  }

  delete(key: string) {
    delete this.data[key];
  }

  clear() {
    this.data = {};
  }
}

function encryptLegacyCredential(plainText: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  return Buffer.concat([iv, cipher.getAuthTag(), encrypted]).toString('base64');
}

describe('CredentialStore', () => {
  let mockStore: MockStore;
  let tempDir: string;

  beforeEach(() => {
    mockStore = new MockStore();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-test-'));
    vi.clearAllMocks();

    (safeStorage.isAsyncEncryptionAvailable as any).mockResolvedValue(true);
    (safeStorage.getSelectedStorageBackend as any).mockReturnValue('gnome_libsecret');
    (safeStorage.encryptStringAsync as any).mockImplementation(async (str: string) =>
      Buffer.from('safestore:' + str)
    );
    (safeStorage.decryptStringAsync as any).mockImplementation(async (buf: Buffer) => ({
      result: buf.toString().replace('safestore:', ''),
      shouldReEncrypt: false,
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error.
    }
  });

  it('resolves non-Vite provider environment keys in the main process', async () => {
    vi.stubEnv('OPENAI_API_KEY', 'sk-proj-main-process');
    vi.stubEnv('VITE_OPENAI_API_KEY', 'sk-proj-renderer-exposed');

    const creds = new CredentialStore(mockStore, tempDir);
    await expect(creds.getKey('openai')).resolves.toBe('sk-proj-main-process');
  });

  it('does not accept Vite-prefixed variables as provider credentials', async () => {
    vi.stubEnv('VITE_OPENAI_API_KEY', 'sk-proj-renderer-exposed');

    const creds = new CredentialStore(mockStore, tempDir);
    await expect(creds.getKey('openai')).resolves.toBeNull();
  });

  it('keeps provider secrets out of renderer AI service code', () => {
    const answerService = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/AnswerGenerationService.ts'),
      'utf8'
    );
    const transcriptionService = fs.readFileSync(
      path.resolve(process.cwd(), 'src/services/whisper.ts'),
      'utf8'
    );

    expect(answerService).not.toMatch(/VITE_(?:GROQ|OPENAI|OPENROUTER)_API_KEY/);
    expect(transcriptionService).not.toMatch(/VITE_(?:GROQ|OPENAI)_API_KEY/);
    expect(transcriptionService).not.toMatch(/getApiKey/);
  });

  it('validates allowed service names', () => {
    const creds = new CredentialStore(mockStore, tempDir);
    expect(creds.isValidService('groq')).toBe(true);
    expect(creds.isValidService('groq-secondary')).toBe(true);
    expect(creds.isValidService('openai')).toBe(true);
    expect(creds.isValidService('openrouter')).toBe(true);
    expect(creds.isValidService('ollama')).toBe(true);
    expect(creds.isValidService('malicious_service')).toBe(false);
  });

  it('rejects setting key for unsupported service', async () => {
    const creds = new CredentialStore(mockStore, tempDir);
    await expect(creds.setKey('aws_bedrock', 'sk-test')).rejects.toThrow(
      'Invalid credential service'
    );
  });

  it('rejects empty and overly long keys', async () => {
    const creds = new CredentialStore(mockStore, tempDir);
    await expect(creds.setKey('groq', '')).rejects.toThrow('API key must be a non-empty string');
    await expect(creds.setKey('groq', ' '.repeat(10))).rejects.toThrow(
      'API key must be a non-empty string'
    );
    await expect(creds.setKey('groq', 'a'.repeat(3000))).rejects.toThrow(
      'API key exceeds maximum length'
    );
  });

  it('rejects Groq keys with valid-looking substrings surrounded by other text', async () => {
    const creds = new CredentialStore(mockStore, tempDir);

    await expect(creds.setKey('groq', 'prefix gsk_valid_key_123')).rejects.toThrow(
      /complete key/i
    );
    await expect(creds.setKey('groq-secondary', 'gsk_valid_key_123 trailing')).rejects.toThrow(
      /complete key/i
    );
    expect(mockStore.get('secure_credentials.groq')).toBeUndefined();
    expect(mockStore.get('secure_credentials.groq-secondary')).toBeUndefined();
    expect(safeStorage.encryptStringAsync).not.toHaveBeenCalled();
  });

  it('ignores malformed Groq environment credentials instead of extracting a substring', async () => {
    vi.stubEnv('GROQ_API_KEY', 'prefix gsk_valid_key_123 trailing');

    const creds = new CredentialStore(mockStore, tempDir);
    await expect(creds.getKey('groq')).resolves.toBeNull();
    expect(safeStorage.encryptStringAsync).not.toHaveBeenCalled();
  });

  it('uses Electron asynchronous safeStorage when the OS key provider is available', async () => {
    const creds = new CredentialStore(mockStore, tempDir);
    const success = await creds.setKey('groq', 'gsk_test_key_12345');
    expect(success).toBe(true);

    const saved = mockStore.get('secure_credentials.groq');
    expect(saved.type).toBe('safeStorage-async');
    expect(saved.data).not.toContain('gsk_test_key_12345');
    expect(safeStorage.encryptStringAsync).toHaveBeenCalledWith('gsk_test_key_12345');

    const retrieved = await creds.getKey('groq');
    expect(retrieved).toBe('gsk_test_key_12345');
  });

  it('fails closed when Electron secure storage is unavailable', async () => {
    (safeStorage.isAsyncEncryptionAvailable as any).mockResolvedValue(false);
    const creds = new CredentialStore(mockStore, tempDir);

    await expect(creds.setKey('openai', 'sk-proj-testkey999')).rejects.toThrow(
      /OS-backed credential storage is unavailable/i
    );
    expect(mockStore.get('secure_credentials.openai')).toBeUndefined();
    expect(fs.existsSync(path.join(tempDir, '.machine_secret'))).toBe(false);
  });

  it('rejects Linux basic_text storage instead of writing credentials with an unprotected key', async () => {
    if (process.platform !== 'linux') return;
    (safeStorage.getSelectedStorageBackend as any).mockReturnValue('basic_text');

    const creds = new CredentialStore(mockStore, tempDir);
    await expect(creds.setKey('openai', 'sk-proj-testkey999')).rejects.toThrow(
      /Secure Linux credential storage is unavailable/i
    );
    expect(mockStore.get('secure_credentials.openai')).toBeUndefined();
    expect(fs.existsSync(path.join(tempDir, '.machine_secret'))).toBe(false);
  });

  it('migrates a legacy AES-GCM record into OS-backed safeStorage when available', async () => {
    const legacyKey = Buffer.alloc(32, 17);
    fs.writeFileSync(path.join(tempDir, '.machine_secret'), legacyKey, { mode: 0o600 });
    mockStore.set('secure_credentials.openai', {
      type: 'aes-gcm',
      data: encryptLegacyCredential('sk-proj-legacy-key', legacyKey),
    });

    const creds = new CredentialStore(mockStore, tempDir);
    await expect(creds.getKey('openai')).resolves.toBe('sk-proj-legacy-key');

    const migrated = mockStore.get('secure_credentials.openai');
    expect(migrated.type).toBe('safeStorage-async');
    expect(migrated.data).not.toContain('sk-proj-legacy-key');
    expect(fs.existsSync(path.join(tempDir, '.machine_secret'))).toBe(false);
  });

  it('does not read legacy AES-GCM credentials when Linux has no secure keyring', async () => {
    if (process.platform !== 'linux') return;
    (safeStorage.getSelectedStorageBackend as any).mockReturnValue('basic_text');

    const legacyKey = Buffer.alloc(32, 23);
    fs.writeFileSync(path.join(tempDir, '.machine_secret'), legacyKey, { mode: 0o600 });
    mockStore.set('secure_credentials.openai', {
      type: 'aes-gcm',
      data: encryptLegacyCredential('sk-proj-legacy-key', legacyKey),
    });

    const creds = new CredentialStore(mockStore, tempDir);
    await expect(creds.getKey('openai')).resolves.toBeNull();
    expect(safeStorage.decryptStringAsync).not.toHaveBeenCalled();
  });

  it('does not create a replacement legacy key when decrypting a record with a missing key', async () => {
    mockStore.set('secure_credentials.openai', {
      type: 'aes-gcm',
      data: Buffer.alloc(32).toString('base64'),
    });

    const creds = new CredentialStore(mockStore, tempDir);
    await expect(creds.getKey('openai')).resolves.toBeNull();
    expect(fs.existsSync(path.join(tempDir, '.machine_secret'))).toBe(false);
  });

  it('re-encrypts records when Electron reports that the OS key has rotated', async () => {
    mockStore.set('secure_credentials.openai', {
      type: 'safeStorage',
      data: Buffer.from('safestore:sk-proj-rotated-key').toString('base64'),
    });
    (safeStorage.decryptStringAsync as any).mockResolvedValueOnce({
      result: 'sk-proj-rotated-key',
      shouldReEncrypt: true,
    });

    const creds = new CredentialStore(mockStore, tempDir);
    await expect(creds.getKey('openai')).resolves.toBe('sk-proj-rotated-key');
    expect(safeStorage.encryptStringAsync).toHaveBeenCalledWith('sk-proj-rotated-key');
    expect(mockStore.get('secure_credentials.openai').type).toBe('safeStorage-async');
  });

  it('deletes keys properly', async () => {
    const creds = new CredentialStore(mockStore, tempDir);
    await creds.setKey('openrouter', 'sk-or-test1234');

    expect(await creds.hasKey('openrouter')).toBe(true);
    await creds.deleteKey('openrouter');
    expect(await creds.hasKey('openrouter')).toBe(false);
    expect(await creds.getKey('openrouter')).toBeNull();
  });

  it('lists configured services accurately, including the secondary Groq slot', async () => {
    const creds = new CredentialStore(mockStore, tempDir);

    await creds.setKey('groq', 'gsk_123');
    await creds.setKey('groq-secondary', 'gsk_789');
    await creds.setKey('openai', 'sk_456');

    const configured = await creds.listConfigured();
    expect(configured).toEqual({
      groq: true,
      'groq-secondary': true,
      openai: true,
      openrouter: false,
      ollama: false,
    });
  });
});
