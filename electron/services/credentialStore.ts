import { safeStorage, app } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const ALLOWED_SERVICES = [
  'groq',
  'groq-secondary',
  'openai',
  'openrouter',
  'ollama',
] as const;
export type AllowedService = (typeof ALLOWED_SERVICES)[number];

const FALLBACK_KEY_FILE = '.machine_secret';

/**
 * Returns a persistent machine-scoped AES key for environments
 * where Electron's safeStorage is not supported (e.g. headless Linux / CI).
 */
function getFallbackAesKey(userDataPath: string, createIfMissing = true): Buffer {
  const keyPath = path.join(userDataPath, FALLBACK_KEY_FILE);

  if (fs.existsSync(keyPath)) {
    let existingKey: Buffer;
    try {
      existingKey = fs.readFileSync(keyPath);
    } catch (err) {
      throw new Error('The credential encryption key exists but cannot be read.', { cause: err });
    }
    if (existingKey.length !== 32) {
      throw new Error(
        'The persisted credential encryption key is invalid; refusing to replace it.'
      );
    }
    return existingKey;
  }

  if (!createIfMissing) {
    throw new Error('The persisted credential encryption key is missing.');
  }

  const newKey = crypto.randomBytes(32);
  try {
    fs.mkdirSync(userDataPath, { recursive: true, mode: 0o700 });
    // Exclusive creation prevents two concurrent writers from silently replacing
    // a key that may already protect credentials.
    fs.writeFileSync(keyPath, newKey, { mode: 0o600, flag: 'wx' });
    return newKey;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === 'EEXIST') {
      try {
        const racedKey = fs.readFileSync(keyPath);
        if (racedKey.length === 32) return racedKey;
      } catch {
        // Fall through to a clear persistence failure below.
      }
    }

    throw new Error(
      'Could not persist the credential encryption key. The API key was not saved; check user-data storage permissions.',
      { cause: err }
    );
  }
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

    let trimmed = key.trim();
    if (service === 'groq' || service === 'groq-secondary') {
      const m = trimmed.match(/gsk_[A-Za-z0-9_-]+/);
      if (!m) {
        throw new Error('Invalid Groq API key format. Groq API keys must begin with "gsk_".');
      }
      trimmed = m[0];
    }

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

  private getEnvKey(service: string): string | null {
    if (service === 'groq') {
      const fromEnv = process.env.GROQ_API_KEY || process.env.VITE_GROQ_API_KEY;
      if (fromEnv && fromEnv.startsWith('gsk_')) return fromEnv;
      try {
        const envPath = path.join(process.cwd(), '.env.local');
        if (fs.existsSync(envPath)) {
          const raw = fs.readFileSync(envPath, 'utf8');
          const m = raw.match(/(?:VITE_)?GROQ_API_KEY\s*=\s*['"]?(gsk_[A-Za-z0-9_-]+)['"]?/);
          if (m && m[1]) return m[1];
        }
      } catch {}
    }
    return null;
  }

  public async getKey(service: string): Promise<string | null> {
    if (!this.isValidService(service)) {
      return null;
    }

    const record = this.store.get(`secure_credentials.${service}`, null);
    if (record && record.data) {
      try {
        let decrypted: string | null = null;
        if (record.type === 'safeStorage') {
          if (safeStorage && typeof safeStorage.decryptString === 'function') {
            const buffer = Buffer.from(record.data, 'base64');
            decrypted = safeStorage.decryptString(buffer);
          }
        } else if (record.type === 'aes-gcm') {
          const aesKey = getFallbackAesKey(this.userDataPath);
          decrypted = aesDecrypt(record.data, aesKey);
        }

        if (decrypted) {
          if (service === 'groq' || service === 'groq-secondary') {
            const m = decrypted.match(/gsk_[A-Za-z0-9_-]+/);
            if (m) return m[0];
            console.warn(
              '[CredentialStore] Stored Groq credential was invalid. Falling back to env key.'
            );
          } else {
            return decrypted;
          }
        }
      } catch (err) {
        console.error(`[CredentialStore] Decryption failed for service ${service}:`, err);
      }
    }

    // Robust fallback: check environment variables and .env.local
    if (service === 'groq') {
      const fallbackKey = this.getEnvKey('groq');
      if (fallbackKey) {
        const m = fallbackKey.match(/gsk_[A-Za-z0-9_-]+/);
        const clean = m ? m[0] : fallbackKey;
        this.setKey('groq', clean).catch(() => {});
        return clean;
      }
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
      'groq-secondary': false,
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
