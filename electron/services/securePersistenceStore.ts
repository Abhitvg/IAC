import { app, safeStorage } from 'electron';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

export const SECURE_PERSISTENCE_NAMESPACES = ['candidate-profile'] as const;
export type SecurePersistenceNamespace = (typeof SECURE_PERSISTENCE_NAMESPACES)[number];

const ENVELOPE_PREFIX = 'IACSAFE1:';
const MAX_RECORD_BYTES = 5 * 1024 * 1024;

interface SecureRecord {
  format: 'iac-secure-persistence';
  version: 1;
  namespace: SecurePersistenceNamespace;
  value: string;
}

export class SecurePersistenceStore {
  private readonly rootPath: string;

  constructor(rootPath?: string) {
    this.rootPath = path.join(rootPath || app.getPath('userData'), 'secure-persistence');
  }

  private assertNamespace(namespace: string): asserts namespace is SecurePersistenceNamespace {
    if (!SECURE_PERSISTENCE_NAMESPACES.includes(namespace as SecurePersistenceNamespace)) {
      throw new Error('Unsupported secure persistence namespace');
    }
  }

  private async assertSecureStorageAvailable(): Promise<void> {
    if (
      !safeStorage ||
      typeof safeStorage.isAsyncEncryptionAvailable !== 'function' ||
      typeof safeStorage.encryptStringAsync !== 'function' ||
      typeof safeStorage.decryptStringAsync !== 'function'
    ) {
      throw new Error('OS-backed secure storage is unavailable. Existing data has been preserved.');
    }

    if (process.platform === 'linux') {
      let backend: string;
      try {
        backend = safeStorage.getSelectedStorageBackend?.() || 'unknown';
      } catch {
        backend = 'unknown';
      }
      if (backend === 'unknown' || backend === 'basic_text') {
        throw new Error(
          'Secure Linux storage is unavailable. Configure GNOME Keyring or KDE Wallet; plaintext fallback is disabled.'
        );
      }
    }

    let available: boolean;
    try {
      available = await safeStorage.isAsyncEncryptionAvailable();
    } catch {
      available = false;
    }
    if (!available) {
      throw new Error('OS keyring is locked or unavailable. Existing data has been preserved.');
    }
  }

  private async assertSafeStoragePath(
    namespace: SecurePersistenceNamespace,
    allowMissing: boolean
  ): Promise<void> {
    try {
      const rootStat = await fs.promises.lstat(this.rootPath);
      if (rootStat.isSymbolicLink() || !rootStat.isDirectory()) {
        throw new Error('Secure persistence directory is not a real directory.');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !allowMissing) throw error;
    }

    try {
      const targetStat = await fs.promises.lstat(this.getRecordPath(namespace));
      if (targetStat.isSymbolicLink() || !targetStat.isFile()) {
        throw new Error('Secure persistence record is not a regular file.');
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT' || !allowMissing) throw error;
    }
  }

  private getRecordPath(namespace: SecurePersistenceNamespace): string {
    return path.join(this.rootPath, namespace + '.enc');
  }

  private serialize(namespace: SecurePersistenceNamespace, value: string): string {
    const record: SecureRecord = {
      format: 'iac-secure-persistence',
      version: 1,
      namespace,
      value,
    };
    return JSON.stringify(record);
  }

  private parse(namespace: SecurePersistenceNamespace, plaintext: string): string {
    let record: unknown;
    try {
      record = JSON.parse(plaintext);
    } catch {
      throw new Error('Encrypted persistence record is corrupt; refusing to discard it.');
    }
    if (
      !record ||
      typeof record !== 'object' ||
      (record as SecureRecord).format !== 'iac-secure-persistence' ||
      (record as SecureRecord).version !== 1 ||
      (record as SecureRecord).namespace !== namespace ||
      typeof (record as SecureRecord).value !== 'string'
    ) {
      throw new Error('Encrypted persistence context mismatch; refusing to load this record.');
    }
    return (record as SecureRecord).value;
  }

  private async encrypt(namespace: SecurePersistenceNamespace, value: string): Promise<Buffer> {
    const plaintext = this.serialize(namespace, value);
    const encrypted = await safeStorage.encryptStringAsync(plaintext);
    if (!Buffer.isBuffer(encrypted) || encrypted.length === 0) {
      throw new Error('OS keyring returned an invalid encrypted record.');
    }
    return Buffer.from(ENVELOPE_PREFIX + encrypted.toString('base64'), 'utf8');
  }

  private async decrypt(
    namespace: SecurePersistenceNamespace,
    envelope: Buffer
  ): Promise<{
    value: string;
    shouldReEncrypt: boolean;
  }> {
    const text = envelope.toString('utf8');
    if (!text.startsWith(ENVELOPE_PREFIX)) {
      throw new Error('Encrypted persistence record has an unsupported format.');
    }
    const encoded = text.slice(ENVELOPE_PREFIX.length);
    if (
      !encoded ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)
    ) {
      throw new Error('Encrypted persistence record is malformed.');
    }
    const result = await safeStorage.decryptStringAsync(Buffer.from(encoded, 'base64'));
    if (!result || typeof result.result !== 'string') {
      throw new Error('OS keyring could not decrypt the persistence record.');
    }
    return {
      value: this.parse(namespace, result.result),
      shouldReEncrypt: result.shouldReEncrypt === true,
    };
  }

  private async writeAtomically(
    namespace: SecurePersistenceNamespace,
    envelope: Buffer
  ): Promise<void> {
    await fs.promises.mkdir(this.rootPath, { recursive: true, mode: 0o700 });
    await this.assertSafeStoragePath(namespace, true);
    if (process.platform !== 'win32') {
      await fs.promises.chmod(this.rootPath, 0o700);
    }
    const target = this.getRecordPath(namespace);
    const temporary = path.join(this.rootPath, '.' + namespace + '.' + randomUUID() + '.tmp');
    await this.assertSafeStoragePath(namespace, true);
    let handle: Awaited<ReturnType<typeof fs.promises.open>> | undefined;
    try {
      handle = await fs.promises.open(temporary, 'wx', 0o600);
      await handle.writeFile(envelope);
      await handle.sync();
      await handle.close();
      handle = undefined;
      await fs.promises.rename(temporary, target);
      try {
        const directory = await fs.promises.open(this.rootPath, 'r');
        try {
          await directory.sync();
        } finally {
          await directory.close();
        }
      } catch {
        // Directory fsync is not supported on every platform; the file itself is synced.
      }
    } catch (error) {
      if (handle) await handle.close().catch(() => undefined);
      await fs.promises.rm(temporary, { force: true }).catch(() => undefined);
      throw error;
    }
  }

  async get(namespace: string): Promise<string | null> {
    this.assertNamespace(namespace);
    await this.assertSecureStorageAvailable();
    const target = this.getRecordPath(namespace);
    await this.assertSafeStoragePath(namespace, true);
    let envelope: Buffer;
    try {
      envelope = await fs.promises.readFile(target);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
    if (envelope.length > MAX_RECORD_BYTES) {
      throw new Error('Encrypted persistence record exceeds the supported size limit.');
    }
    const decrypted = await this.decrypt(namespace, envelope);
    if (decrypted.shouldReEncrypt) {
      const rotated = await this.encrypt(namespace, decrypted.value);
      await this.writeAtomically(namespace, rotated);
    }
    return decrypted.value;
  }

  async set(namespace: string, value: unknown): Promise<boolean> {
    this.assertNamespace(namespace);
    if (typeof value !== 'string') throw new Error('Secure persistence value must be a string.');
    const byteLength = Buffer.byteLength(value, 'utf8');
    if (byteLength > MAX_RECORD_BYTES) {
      throw new Error('Secure persistence value exceeds the 5 MB limit.');
    }

    await this.assertSecureStorageAvailable();
    const envelope = await this.encrypt(namespace, value);
    if (envelope.length > MAX_RECORD_BYTES) {
      throw new Error('Encrypted persistence record exceeds the 5 MB limit.');
    }

    // Verify the exact ciphertext before replacing the previous durable record.
    const verified = await this.decrypt(namespace, envelope);
    if (verified.value !== value) {
      throw new Error('Encrypted persistence verification failed; previous data was preserved.');
    }
    await this.writeAtomically(namespace, envelope);

    // Verify the committed file as well. Never report success for an unverified write.
    const committed = await fs.promises.readFile(this.getRecordPath(namespace));
    const committedValue = await this.decrypt(namespace, committed);
    if (committedValue.value !== value) {
      throw new Error('Committed persistence verification failed.');
    }
    return true;
  }

  async remove(namespace: string): Promise<boolean> {
    this.assertNamespace(namespace);
    await this.assertSecureStorageAvailable();
    await this.assertSafeStoragePath(namespace, true);
    await fs.promises.rm(this.getRecordPath(namespace), { force: true });
    return true;
  }
}
