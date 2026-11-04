import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import os from 'os';

// Mock electron before importing CredentialStore
vi.mock('electron', () => {
  return {
    app: {
      getPath: () => os.tmpdir(),
    },
    safeStorage: {
      isEncryptionAvailable: vi.fn(),
      encryptString: vi.fn(),
      decryptString: vi.fn(),
    },
  };
});

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

describe('CredentialStore', () => {
  let mockStore: MockStore;
  let tempDir: string;

  beforeEach(() => {
    mockStore = new MockStore();
    tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cred-test-'));
    vi.clearAllMocks();
  });

  afterEach(() => {
    try {
      fs.rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
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

  it('uses safeStorage when available', async () => {
    (safeStorage.isEncryptionAvailable as any).mockReturnValue(true);
    (safeStorage.encryptString as any).mockImplementation((str: string) =>
      Buffer.from('safestore:' + str)
    );
    (safeStorage.decryptString as any).mockImplementation((buf: Buffer) =>
      buf.toString().replace('safestore:', '')
    );

    const creds = new CredentialStore(mockStore, tempDir);
    const success = await creds.setKey('groq', 'gsk_test_key_12345');
    expect(success).toBe(true);

    const saved = mockStore.get('secure_credentials.groq');
    expect(saved.type).toBe('safeStorage');
    // Secret must NOT be in plaintext in store
    expect(saved.data).not.toContain('gsk_test_key_12345');

    const retrieved = await creds.getKey('groq');
    expect(retrieved).toBe('gsk_test_key_12345');
  });

  it('falls back to machine-scoped AES-256-GCM when safeStorage is unavailable', async () => {
    (safeStorage.isEncryptionAvailable as any).mockReturnValue(false);

    const creds = new CredentialStore(mockStore, tempDir);
    const success = await creds.setKey('openai', 'sk-proj-testkey999');
    expect(success).toBe(true);

    const saved = mockStore.get('secure_credentials.openai');
    expect(saved.type).toBe('aes-gcm');
    expect(saved.data).not.toContain('sk-proj-testkey999');

    const retrieved = await creds.getKey('openai');
    expect(retrieved).toBe('sk-proj-testkey999');
  });

  it('does not save credentials when the fallback encryption key cannot be persisted', async () => {
    (safeStorage.isEncryptionAvailable as any).mockReturnValue(false);
    const blockedPath = path.join(tempDir, 'not-a-directory');
    fs.writeFileSync(blockedPath, 'this path is a file');

    const creds = new CredentialStore(mockStore, blockedPath);
    await expect(creds.setKey('openai', 'sk-proj-secret')).rejects.toThrow(
      /Could not persist the credential encryption key/i
    );
    expect(mockStore.get('secure_credentials.openai')).toBeUndefined();
  });

  it('does not create a replacement key when decrypting a record with a missing key', async () => {
    (safeStorage.isEncryptionAvailable as any).mockReturnValue(false);
    mockStore.set('secure_credentials.openai', {
      type: 'aes-gcm',
      data: Buffer.alloc(32).toString('base64'),
    });

    const creds = new CredentialStore(mockStore, tempDir);
    await expect(creds.getKey('openai')).resolves.toBeNull();
    expect(fs.existsSync(path.join(tempDir, '.machine_secret'))).toBe(false);
  });

  it('deletes keys properly', async () => {
    (safeStorage.isEncryptionAvailable as any).mockReturnValue(false);
    const creds = new CredentialStore(mockStore, tempDir);
    await creds.setKey('openrouter', 'sk-or-test1234');

    expect(await creds.hasKey('openrouter')).toBe(true);
    await creds.deleteKey('openrouter');
    expect(await creds.hasKey('openrouter')).toBe(false);
    expect(await creds.getKey('openrouter')).toBeNull();
  });

  it('lists configured services accurately, including the secondary Groq slot', async () => {
    (safeStorage.isEncryptionAvailable as any).mockReturnValue(false);
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
