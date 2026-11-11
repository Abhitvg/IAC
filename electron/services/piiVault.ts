import { safeStorage } from 'electron';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const KEY_FILE = '.iac-pii-vault-key.v1';
const VAULT_DIRECTORY = 'pii-vault';
const MAX_RECORD_BYTES = 10 * 1024 * 1024;
const NAMESPACE_PATTERN = /^(candidate|practice|careerops|sessions)$/;
const KEY_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;

type SafeStorageAdapter = Pick<
  typeof safeStorage,
  | 'isAsyncEncryptionAvailable'
  | 'encryptStringAsync'
  | 'decryptStringAsync'
  | 'getSelectedStorageBackend'
>;

interface EncryptedRecord {
  format: 'iac-pii-vault';
  version: 1;
  algorithm: 'aes-256-gcm';
  iv: string;
  tag: string;
  ciphertext: string;
}

function encodeBase64Url(value: Buffer): string {
  return value.toString('base64url');
}

function decodeBase64Url(value: string, expectedLength?: number): Buffer {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) {
    throw new Error('Encrypted PII record contains malformed base64url data.');
  }
  const decoded = Buffer.from(value, 'base64url');
  if (decoded.toString('base64url') !== value) {
    throw new Error('Encrypted PII record contains non-canonical base64url data.');
  }
  if (expectedLength !== undefined && decoded.length !== expectedLength) {
    throw new Error('Encrypted PII record contains invalid cryptographic metadata.');
  }
  return decoded;
}

/**
 * Main-process-only encrypted persistence for candidate and practice PII.
 * The data-encryption key is random and stored only as an OS-safeStorage
 * encrypted blob. Records use AES-256-GCM with namespace/key AAD.
 */
export class PiiVault {
  private readonly userDataPath: string;
  private readonly storage: SafeStorageAdapter;
  private masterKeyPromise: Promise<Buffer> | null = null;

  constructor(userDataPath: string, storage: SafeStorageAdapter = safeStorage) {
    if (!path.isAbsolute(userDataPath)) {
      throw new Error('PII vault requires an absolute userData path.');
    }
    this.userDataPath = path.resolve(userDataPath);
    this.storage = storage;
  }

  private get keyPath(): string {
    return path.join(this.userDataPath, KEY_FILE);
  }

  private get vaultPath(): string {
    return path.join(this.userDataPath, VAULT_DIRECTORY);
  }

  private async assertSecureStorageAvailable(): Promise<void> {
    if (
      typeof this.storage.isAsyncEncryptionAvailable !== 'function' ||
      typeof this.storage.encryptStringAsync !== 'function' ||
      typeof this.storage.decryptStringAsync !== 'function'
    ) {
      throw new Error('OS-backed encryption is unavailable. PII remains locked; no fallback is permitted.');
    }

    if (process.platform === 'linux') {
      const backend = this.storage.getSelectedStorageBackend?.() || 'unknown';
      if (backend === 'unknown' || backend === 'basic_text') {
        throw new Error(
          'Secure Linux keyring is unavailable. Configure GNOME Keyring or KDE Wallet before accessing encrypted PII.'
        );
      }
    }

    if (!(await this.storage.isAsyncEncryptionAvailable())) {
      throw new Error(
        'OS-backed encryption is unavailable or locked. Unlock the system keyring before accessing encrypted PII.'
      );
    }
  }

  private async loadMasterKey(): Promise<Buffer> {
    await this.assertSecureStorageAvailable();
    await fs.promises.mkdir(this.userDataPath, { recursive: true, mode: 0o700 });

    if (fs.existsSync(this.keyPath)) {
      const raw = await fs.promises.readFile(this.keyPath, 'utf8');
      let record: { version?: unknown; data?: unknown };
      try {
        record = JSON.parse(raw) as { version?: unknown; data?: unknown };
      } catch {
        throw new Error('PII vault key metadata is corrupt. Data was not overwritten.');
      }
      if (record.version !== 1 || typeof record.data !== 'string') {
        throw new Error('PII vault key metadata is unsupported. Data was not overwritten.');
      }

      const encryptedKey = decodeBase64Url(record.data);
      const decrypted = await this.storage.decryptStringAsync(encryptedKey);
      const key = Buffer.from(decrypted.result, 'base64');
      if (key.length !== 32) {
        key.fill(0);
        throw new Error('PII vault master key is invalid. Data was not overwritten.');
      }
      if (decrypted.shouldReEncrypt) {
        await this.writeWrappedMasterKey(key);
      }
      return key;
    }

    const key = crypto.randomBytes(32);
    try {
      await this.writeWrappedMasterKey(key);
      return key;
    } catch (error) {
      key.fill(0);
      throw error;
    }
  }

  private async writeWrappedMasterKey(key: Buffer): Promise<void> {
    const encrypted = await this.storage.encryptStringAsync(key.toString('base64'));
    if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) {
      throw new Error('OS keyring returned an invalid encrypted PII vault key.');
    }
    const payload = JSON.stringify({
      version: 1,
      data: encodeBase64Url(encrypted),
    });
    const tempPath = path.join(
      this.userDataPath,
      `${KEY_FILE}.${process.pid}.${crypto.randomUUID()}.tmp`
    );
    let handle: fs.promises.FileHandle | undefined;
    try {
      handle = await fs.promises.open(tempPath, 'wx', 0o600);
      await handle.writeFile(payload, 'utf8');
      await handle.sync();
      await handle.close();
      handle = undefined;
      await fs.promises.rename(tempPath, this.keyPath);
      await this.syncDirectory(this.userDataPath);
    } catch (error) {
      if (handle) await handle.close().catch(() => undefined);
      await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  private async syncDirectory(directoryPath: string): Promise<void> {
    let directory: fs.promises.FileHandle | undefined;
    try {
      directory = await fs.promises.open(directoryPath, 'r');
      await directory.sync();
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (!['EINVAL', 'ENOTSUP', 'EISDIR', 'EPERM', 'EACCES'].includes(code || '')) {
        throw error;
      }
    } finally {
      await directory?.close();
    }
  }

  private async getMasterKey(): Promise<Buffer> {
    await this.assertSecureStorageAvailable();
    if (!this.masterKeyPromise) {
      this.masterKeyPromise = this.loadMasterKey().catch((error) => {
        this.masterKeyPromise = null;
        throw error;
      });
    }
    return this.masterKeyPromise;
  }

  private validateAddress(namespace: string, key: string): void {
    if (!NAMESPACE_PATTERN.test(namespace)) {
      throw new Error('Unsupported PII vault namespace.');
    }
    if (!KEY_PATTERN.test(key) || key === '.' || key === '..') {
      throw new Error('Invalid PII vault record key.');
    }
  }

  private recordPath(namespace: string, key: string): string {
    this.validateAddress(namespace, key);
    return path.join(this.vaultPath, namespace, `${key}.json.enc`);
  }

  private associatedData(namespace: string, key: string): Buffer {
    return Buffer.from(`iac-pii-vault:v1|${namespace}|${key}`, 'utf8');
  }

  public async put(namespace: string, key: string, value: unknown): Promise<void> {
    const destination = this.recordPath(namespace, key);
    const serialized = JSON.stringify(value);
    if (typeof serialized !== 'string') {
      throw new Error('PII vault values must be JSON-serializable.');
    }
    const plaintext = Buffer.from(serialized, 'utf8');
    if (plaintext.length > MAX_RECORD_BYTES) {
      plaintext.fill(0);
      throw new Error('PII vault record exceeds the 10 MiB limit.');
    }

    const masterKey = await this.getMasterKey();
    const iv = crypto.randomBytes(12);
    try {
      const cipher = crypto.createCipheriv('aes-256-gcm', masterKey, iv);
      cipher.setAAD(this.associatedData(namespace, key));
      const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
      const record: EncryptedRecord = {
        format: 'iac-pii-vault',
        version: 1,
        algorithm: 'aes-256-gcm',
        iv: encodeBase64Url(iv),
        tag: encodeBase64Url(cipher.getAuthTag()),
        ciphertext: encodeBase64Url(encrypted),
      };
      await fs.promises.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 });
      const tempPath = `${destination}.${process.pid}.${crypto.randomUUID()}.tmp`;
      let handle: fs.promises.FileHandle | undefined;
      try {
        handle = await fs.promises.open(tempPath, 'wx', 0o600);
        await handle.writeFile(JSON.stringify(record), 'utf8');
        await handle.sync();
        await handle.close();
        handle = undefined;
        await fs.promises.rename(tempPath, destination);
        await this.syncDirectory(path.dirname(destination));
      } catch (error) {
        if (handle) await handle.close().catch(() => undefined);
        await fs.promises.rm(tempPath, { force: true }).catch(() => undefined);
        throw error;
      } finally {
        encrypted.fill(0);
      }
    } finally {
      plaintext.fill(0);
      iv.fill(0);
    }
  }

  public async get<T>(namespace: string, key: string): Promise<T | null> {
    const source = this.recordPath(namespace, key);
    let raw: string;
    try {
      const stat = await fs.promises.stat(source);
      if (!stat.isFile() || stat.size > MAX_RECORD_BYTES + 4096) {
        throw new Error('PII vault record has an invalid size or file type.');
      }
      raw = await fs.promises.readFile(source, 'utf8');
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }

    let record: EncryptedRecord;
    try {
      record = JSON.parse(raw) as EncryptedRecord;
    } catch {
      throw new Error('PII vault record is corrupt. Original data was preserved.');
    }
    if (
      record.format !== 'iac-pii-vault' ||
      record.version !== 1 ||
      record.algorithm !== 'aes-256-gcm' ||
      typeof record.iv !== 'string' ||
      typeof record.tag !== 'string' ||
      typeof record.ciphertext !== 'string'
    ) {
      throw new Error('PII vault record format is unsupported. Original data was preserved.');
    }

    const iv = decodeBase64Url(record.iv, 12);
    const tag = decodeBase64Url(record.tag, 16);
    const ciphertext = decodeBase64Url(record.ciphertext);
    if (ciphertext.length === 0 || ciphertext.length > MAX_RECORD_BYTES) {
      throw new Error('PII vault ciphertext has an invalid size.');
    }

    const masterKey = await this.getMasterKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', masterKey, iv);
    decipher.setAAD(this.associatedData(namespace, key));
    decipher.setAuthTag(tag);
    const chunks: Buffer[] = [];
    try {
      chunks.push(decipher.update(ciphertext));
      chunks.push(decipher.final());
      return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
    } catch {
      throw new Error('PII vault authentication failed. Original data was preserved.');
    } finally {
      for (const chunk of chunks) chunk.fill(0);
      iv.fill(0);
      tag.fill(0);
      ciphertext.fill(0);
    }
  }

  public async delete(namespace: string, key: string): Promise<boolean> {
    const target = this.recordPath(namespace, key);
    try {
      await fs.promises.unlink(target);
      return true;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
      throw error;
    }
  }

  /** A migration caller may delete its plaintext source only after this returns. */
  public async verify(namespace: string, key: string, expected: unknown): Promise<boolean> {
    const actual = await this.get(namespace, key);
    return JSON.stringify(actual) === JSON.stringify(expected);
  }
}
