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

const LEGACY_FALLBACK_KEY_FILE = '.machine_secret';
const GROQ_API_KEY_PATTERN = /^gsk_[A-Za-z0-9_-]+$/;

function getExistingLegacyAesKey(userDataPath: string): Buffer {
  const keyPath = path.join(userDataPath, LEGACY_FALLBACK_KEY_FILE);
  if (!fs.existsSync(keyPath)) {
    throw new Error('The legacy credential encryption key is missing.');
  }

  const key = fs.readFileSync(keyPath);
  if (key.length !== 32) {
    throw new Error('The legacy credential encryption key is invalid.');
  }
  return key;
}

/** Read-only support for credentials written by the former local AES-GCM fallback. */
function decryptLegacyAesRecord(packedBase64: string, key: Buffer): string {
  const buffer = Buffer.from(packedBase64, 'base64');
  if (buffer.length < 28) throw new Error('Invalid legacy credential cipher data');
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

  /**
   * Require Electron's asynchronous safeStorage API and an OS-backed provider.
   * Electron's Linux basic_text backend uses a hardcoded password and is not
   * suitable for protecting API credentials. Never downgrade to a key stored
   * beside the ciphertext.
   */
  private async assertSecureStorageAvailable(): Promise<void> {
    if (
      !safeStorage ||
      typeof safeStorage.isAsyncEncryptionAvailable !== 'function' ||
      typeof safeStorage.encryptStringAsync !== 'function' ||
      typeof safeStorage.decryptStringAsync !== 'function'
    ) {
      throw new Error(
        'OS-backed credential storage is unavailable. Update the app before saving API keys.'
      );
    }

    if (process.platform === 'linux') {
      let backend = 'unknown';
      try {
        if (typeof safeStorage.getSelectedStorageBackend === 'function') {
          backend = safeStorage.getSelectedStorageBackend();
        }
      } catch (error) {
        console.warn('[CredentialStore] Could not identify the Linux keyring backend:', error);
      }

      if (!backend || backend === 'unknown' || backend === 'basic_text') {
        throw new Error(
          'Secure Linux credential storage is unavailable. Configure GNOME Keyring or KDE Wallet and restart the app. API keys are not saved to an unprotected fallback.'
        );
      }
    }

    let available = false;
    try {
      available = await safeStorage.isAsyncEncryptionAvailable();
    } catch (error) {
      console.warn('[CredentialStore] OS-backed credential storage check failed:', error);
    }

    if (!available) {
      throw new Error(
        'OS-backed credential storage is unavailable. Unlock or configure your system keyring before saving API keys.'
      );
    }
  }

  private removeLegacyKeyFileWhenUnused(): void {
    const hasLegacyRecords = ALLOWED_SERVICES.some((service) => {
      const record = this.store.get(`secure_credentials.${service}`, null);
      return record?.type === 'aes-gcm';
    });
    if (hasLegacyRecords) return;

    const keyPath = path.join(this.userDataPath, LEGACY_FALLBACK_KEY_FILE);
    try {
      if (fs.existsSync(keyPath)) fs.unlinkSync(keyPath);
    } catch (error) {
      console.warn('[CredentialStore] Could not remove the retired legacy AES key file:', error);
    }
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
      if (!GROQ_API_KEY_PATTERN.test(trimmed)) {
        throw new Error('Invalid Groq API key format. Enter the complete key beginning with "gsk_".');
      }
    }

    await this.assertSecureStorageAvailable();
    const encrypted = await safeStorage.encryptStringAsync(trimmed);
    this.store.set(`secure_credentials.${service}`, {
      type: 'safeStorage-async',
      data: encrypted.toString('base64'),
      updatedAt: Date.now(),
    });
    this.removeLegacyKeyFileWhenUnused();
    return true;
  }

  private getEnvKey(service: string): string | null {
    const envNameByService: Partial<Record<AllowedService, string>> = {
      groq: 'GROQ_API_KEY',
      openai: 'OPENAI_API_KEY',
      openrouter: 'OPENROUTER_API_KEY',
    };
    const envName = envNameByService[service as AllowedService];
    if (!envName) return null;

    const fromProcess = process.env[envName]?.trim();
    if (fromProcess) return fromProcess;

    try {
      const envPath = path.join(process.cwd(), '.env.local');
      if (!fs.existsSync(envPath)) return null;

      const raw = fs.readFileSync(envPath, 'utf8');
      const line = raw.split(/\r?\n/).find((entry) => {
        const separator = entry.indexOf('=');
        return separator >= 0 && entry.slice(0, separator).trim() === envName;
      });
      if (!line) return null;

      const value = line.slice(line.indexOf('=') + 1).trim();
      return (
        value
          .replace(/^["']|["']$/g, '')
          .split('#')[0]
          .trim() || null
      );
    } catch {
      // Environment file lookup is best-effort; do not block normal startup.
      return null;
    }
  }

  public async getKey(service: string): Promise<string | null> {
    if (!this.isValidService(service)) {
      return null;
    }

    const record = this.store.get(`secure_credentials.${service}`, null);
    if (record && record.data) {
      try {
        if (record.type === 'safeStorage' || record.type === 'safeStorage-async') {
          await this.assertSecureStorageAvailable();
          const decryptedRecord = await safeStorage.decryptStringAsync(
            Buffer.from(record.data, 'base64')
          );
          const decrypted = decryptedRecord.result;

          if (decrypted) {
            if (decryptedRecord.shouldReEncrypt) {
              await this.setKey(service, decrypted);
            }
            if (service === 'groq' || service === 'groq-secondary') {
              const normalized = decrypted.trim();
              if (GROQ_API_KEY_PATTERN.test(normalized)) return normalized;
              console.warn(
                '[CredentialStore] Stored Groq credential was invalid. Falling back to env key.'
              );
            } else {
              return decrypted;
            }
          }
        } else if (record.type === 'aes-gcm') {
          // Migrate legacy local AES records only when a real OS keyring is available.
          // Do not decrypt or return them on systems without a secure storage backend.
          await this.assertSecureStorageAvailable();
          const legacyKey = getExistingLegacyAesKey(this.userDataPath);
          const decrypted = decryptLegacyAesRecord(record.data, legacyKey);
          await this.setKey(service, decrypted);
          this.removeLegacyKeyFileWhenUnused();

          if (service === 'groq' || service === 'groq-secondary') {
            const normalized = decrypted.trim();
            return GROQ_API_KEY_PATTERN.test(normalized) ? normalized : null;
          }
          return decrypted;
        }
      } catch (error) {
        console.error(
          `[CredentialStore] Secure credential retrieval failed for service ${service}:`,
          error
        );
      }
    }

    // Environment fallbacks are resolved only in the Electron main process.
    if (service === 'groq' || service === 'openai' || service === 'openrouter') {
      const fallbackKey = this.getEnvKey(service);
      if (fallbackKey) {
        const clean =
          service === 'groq'
            ? GROQ_API_KEY_PATTERN.test(fallbackKey) ? fallbackKey : ''
            : fallbackKey;
        if (!clean) return null;
        this.setKey(service, clean).catch(() => {});
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
    this.removeLegacyKeyFileWhenUnused();
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
