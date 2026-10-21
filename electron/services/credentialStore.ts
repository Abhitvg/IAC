import { safeStorage, app } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const ALLOWED_SERVICES = ['groq', 'openai', 'openrouter', 'ollama'] as const;
export type AllowedService = (typeof ALLOWED_SERVICES)[number];

const FALLBACK_KEY_FILE = '.machine_secret';

/**
 * Returns a persistent machine-scoped AES key for environments
 * where Electron's safeStorage is not supported (e.g. headless Linux / CI).
 */
function getFallbackAesKey(userDataPath: string): Buffer {
  const keyPath = path.join(userDataPath, FALLBACK_KEY_FILE);
  if (fs.existsSync(keyPath)) {
    try {
      const raw = fs.readFileSync(keyPath);
      if (raw.length === 32) return raw;
    } catch {
      // Fall through to regenerate
    }
  }

  const newKey = crypto.randomBytes(32);
  try {
    fs.writeFileSync(keyPath, newKey, { mode: 0o600 });
  } catch (err) {
    console.warn('[CredentialStore] Could not write machine secret file with 0600 mode:', err);
  }
  return newKey;
}

function aesEncrypt(plainText: string, key: Buffer): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Packed format: iv (12) + tag (16) + encrypted
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

function aesDecrypt(packedBase64: string, key: Buffer): string {
  const buffer = Buffer.from(packedBase64, 'base64');
  if (buffer.length < 28) throw new Error('Invalid cipher data');
  const iv = buffer.subarray(0, 12);
  const tag = buffer.subarray(12, 28);
  const encrypted = buffer.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

export class CredentialStore {
  private store: any;
  private userDataPath: string;

  constructor(electronStore: any, userDataPath?: string) {
    this.store = electronStore;
    this.userDataPath = userDataPath || (app ? app.getPath('userData') : process.cwd());
  }

  public isValidService(service: string): service is AllowedService {
    return ALLOWED_SERVICES.includes(service as AllowedService);
  }

  public async setKey(service: string, key: string): Promise<boolean> {
    if (!this.isValidService(service)) {
      throw new Error(
        `Invalid credential service: "${service}". Allowed: ${ALLOWED_SERVICES.join(', ')}`
      );
    }

    if (typeof key !== 'string' || key.trim().length === 0) {
      throw new Error('API key must be a non-empty string');
    }

    if (key.length > 2048) {
      throw new Error('API key exceeds maximum length of 2048 characters');
    }

    const trimmed = key.trim();

    // Check if safeStorage is available
    if (
      safeStorage &&
      typeof safeStorage.isEncryptionAvailable === 'function' &&
      safeStorage.isEncryptionAvailable()
    ) {
      try {
        const encrypted = safeStorage.encryptString(trimmed);
        this.store.set(`secure_credentials.${service}`, {
          type: 'safeStorage',
          data: encrypted.toString('base64'),
          updatedAt: Date.now(),
        });
        return true;
      } catch (err) {
        console.warn(`[CredentialStore] safeStorage encryption failed, falling back to AES:`, err);
      }
    }

    // Fallback AES-256-GCM
    const aesKey = getFallbackAesKey(this.userDataPath);
    const cipherText = aesEncrypt(trimmed, aesKey);
    this.store.set(`secure_credentials.${service}`, {
      type: 'aes-gcm',
      data: cipherText,
      updatedAt: Date.now(),
    });
    return true;
  }

  public async getKey(service: string): Promise<string | null> {
    if (!this.isValidService(service)) {
      return null;
    }

    const record = this.store.get(`secure_credentials.${service}`, null);
    if (!record || !record.data) {
      return null;
    }

    try {
      if (record.type === 'safeStorage') {
        if (safeStorage && typeof safeStorage.decryptString === 'function') {
          const buffer = Buffer.from(record.data, 'base64');
          return safeStorage.decryptString(buffer);
        }
      } else if (record.type === 'aes-gcm') {
        const aesKey = getFallbackAesKey(this.userDataPath);
        return aesDecrypt(record.data, aesKey);
      }
    } catch (err) {
      console.error(`[CredentialStore] Decryption failed for service ${service}:`, err);
      return null;
    }

    return null;
  }

  public async deleteKey(service: string): Promise<boolean> {
    if (!this.isValidService(service)) {
      return false;
    }
    this.store.delete(`secure_credentials.${service}`);
    return true;
  }

  public async hasKey(service: string): Promise<boolean> {
    const key = await this.getKey(service);
    return typeof key === 'string' && key.length > 0;
  }

  public async listConfigured(): Promise<Record<AllowedService, boolean>> {
    const result: Record<AllowedService, boolean> = {
      groq: false,
      openai: false,
      openrouter: false,
      ollama: false,
    };

    for (const service of ALLOWED_SERVICES) {
      result[service] = await this.hasKey(service);
    }

    return result;
  }
}
