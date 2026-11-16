import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

export const SECURE_RECORD_NAMESPACES = [
  'interview-sessions',
  'candidate-vault',
  'careerops',
  'practice',
  'knowledge-vault',
  'app-workspaces',
] as const;

export type SecureRecordNamespace = (typeof SECURE_RECORD_NAMESPACES)[number];

export interface SecureStorageDecryption {
  result: string;
  shouldReEncrypt: boolean;
}

export interface SecureStorageAdapter {
  isAsyncEncryptionAvailable(): Promise<boolean>;
  encryptStringAsync(value: string): Promise<Buffer>;
  decryptStringAsync(value: Buffer): Promise<SecureStorageDecryption>;
  getSelectedStorageBackend?: () => string;
}

const VERSION = 1;
const MAX_RECORD_BYTES = 5 * 1024 * 1024;
const KEY_FILE = 'secure-record-store.key';

interface Envelope {
  version: 1;
  algorithm: 'aes-256-gcm';
  iv: string;
  authTag: string;
  ciphertext: string;
}

function validNamespace(value: unknown): value is SecureRecordNamespace {
  return (
    typeof value === 'string' && (SECURE_RECORD_NAMESPACES as readonly string[]).includes(value)
  );
}

function validId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}

function ensureDirectorySafe(directory: string, create: boolean): boolean {
  if (!fs.existsSync(directory)) {
    if (!create) return false;
    fs.mkdirSync(directory, { mode: 0o700 });
  }

  const stat = fs.lstatSync(directory);
  if (!stat.isDirectory() || stat.isSymbolicLink()) {
    throw new Error('Secure record directory is not a regular directory.');
  }
  return true;
}

function atomicWrite(filePath: string, content: string): void {
  const directory = path.dirname(filePath);
  fs.mkdirSync(directory, { recursive: true, mode: 0o700 });

  const temporaryPath = path.join(
    directory,
    '.' + path.basename(filePath) + '.' + crypto.randomUUID() + '.tmp'
  );
  let descriptor: number | undefined;

  try {
    descriptor = fs.openSync(temporaryPath, 'wx', 0o600);
    fs.writeFileSync(descriptor, content, 'utf8');
    fs.fsyncSync(descriptor);
    fs.closeSync(descriptor);
    descriptor = undefined;
    fs.renameSync(temporaryPath, filePath);

    try {
      const directoryFd = fs.openSync(directory, 'r');
      try {
        fs.fsyncSync(directoryFd);
      } finally {
        fs.closeSync(directoryFd);
      }
    } catch {
      // Directory fsync is unsupported on some platforms.
    }
  } finally {
    if (descriptor !== undefined) fs.closeSync(descriptor);
    try {
      fs.unlinkSync(temporaryPath);
    } catch {
      // Best-effort temporary-file cleanup.
    }
  }
}

/**
 * Device-local AES-GCM records. The random data key is wrapped by OS safeStorage
 * and never crosses the IPC boundary.
 */
export class EncryptedRecordStore {
  private readonly rootDir: string;
  private readonly storage: SecureStorageAdapter;
  private readonly platform: string;
  private keyPromise: Promise<Buffer> | null = null;
  private readonly namespaceQueues = new Map<string, Promise<void>>();

  private async withNamespaceLock<T>(namespace: SecureRecordNamespace, operation: () => Promise<T>): Promise<T> {
    const previous = this.namespaceQueues.get(namespace) || Promise.resolve();
    let release!: () => void;
    const current = new Promise<void>((resolve) => { release = resolve; });
    const tail = previous.then(() => current);
    this.namespaceQueues.set(namespace, tail);
    await previous;
    try {
      return await operation();
    } finally {
      release();
      if (this.namespaceQueues.get(namespace) === tail) this.namespaceQueues.delete(namespace);
    }
  }

  constructor(options: { rootDir: string; storage: SecureStorageAdapter; platform?: string }) {
    this.rootDir = path.resolve(options.rootDir);
    this.storage = options.storage;
    this.platform = options.platform || process.platform;
  }

  private async assertSecureStorage(): Promise<void> {
    if (this.platform === 'linux') {
      let backend = 'unknown';
      try {
        backend = this.storage.getSelectedStorageBackend?.() || 'unknown';
      } catch {
        // Fail closed when the provider cannot be identified.
      }

      if (!backend || backend === 'unknown' || backend === 'basic_text') {
        throw new Error(
          'OS-backed secure storage is unavailable. Configure a system keyring; no plaintext fallback is permitted.'
        );
      }
    }

    const available = await this.storage.isAsyncEncryptionAvailable();

    if (!available) {
      throw new Error(
        'OS-backed secure storage is unavailable. Unlock or configure the system keyring before using encrypted records.'
      );
    }
  }

  private async rewrapKey(keyPath: string, plaintext: string): Promise<void> {
    const wrapped = await this.storage.encryptStringAsync(plaintext);
    atomicWrite(keyPath, JSON.stringify({ version: VERSION, data: wrapped.toString('base64') }));
  }

  private async loadOrCreateKey(): Promise<Buffer> {
    await this.assertSecureStorage();

    if (!fs.existsSync(path.dirname(this.rootDir))) {
      throw new Error('Secure record parent directory is unavailable.');
    }
    ensureDirectorySafe(this.rootDir, true);

    const keyPath = path.join(this.rootDir, KEY_FILE);
    if (fs.existsSync(keyPath)) {
      const stat = fs.lstatSync(keyPath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error('Secure record key file is not a regular file.');
      }

      const wrapped = JSON.parse(fs.readFileSync(keyPath, 'utf8')) as {
        version?: number;
        data?: string;
      };
      if (
        wrapped.version !== VERSION ||
        typeof wrapped.data !== 'string' ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(wrapped.data)
      ) {
        throw new Error('Secure record key file is malformed.');
      }

      const decrypted = await this.storage.decryptStringAsync(Buffer.from(wrapped.data, 'base64'));
      const key = Buffer.from(decrypted.result, 'base64');
      if (key.length !== 32) {
        throw new Error('Secure record key could not be recovered.');
      }
      if (decrypted.shouldReEncrypt) {
        await this.rewrapKey(keyPath, decrypted.result);
      }
      return key;
    }

    const key = crypto.randomBytes(32);
    const wrapped = await this.storage.encryptStringAsync(key.toString('base64'));
    if (!Buffer.isBuffer(wrapped) || wrapped.length === 0) {
      throw new Error('OS-backed secure storage failed to protect the record key.');
    }

    atomicWrite(keyPath, JSON.stringify({ version: VERSION, data: wrapped.toString('base64') }));
    return key;
  }

  private getKey(): Promise<Buffer> {
    if (!this.keyPromise) {
      this.keyPromise = this.loadOrCreateKey().catch((error) => {
        this.keyPromise = null;
        throw error;
      });
    }
    return this.keyPromise;
  }

  private recordPath(namespace: SecureRecordNamespace, id: string): string {
    const digest = crypto.createHash('sha256').update(id, 'utf8').digest('hex');
    return path.join(this.rootDir, 'records', namespace, digest + '.json');
  }

  private async writeRecord(namespace: SecureRecordNamespace, id: string, plaintext: string): Promise<void> {
    const key = await this.getKey();
    const iv = crypto.randomBytes(12);
    const aad = Buffer.from('iac-secure-record:v' + VERSION + ':' + namespace + ':' + id, 'utf8');
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad);
    const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const envelope: Envelope = {
      version: VERSION,
      algorithm: 'aes-256-gcm',
      iv: iv.toString('base64'),
      authTag: cipher.getAuthTag().toString('base64'),
      ciphertext: ciphertext.toString('base64'),
    };
    ensureDirectorySafe(path.join(this.rootDir, 'records'), true);
    ensureDirectorySafe(path.join(this.rootDir, 'records', namespace), true);
    atomicWrite(this.recordPath(namespace, id), JSON.stringify(envelope));
  }

  private async readIndex(namespace: SecureRecordNamespace): Promise<string[]> {
    const raw = await this.get(namespace, '__index__');
    if (raw === null) return [];
    let parsed: unknown;
    try { parsed = JSON.parse(raw); } catch { throw new Error('Secure record index is malformed.'); }
    if (!Array.isArray(parsed) || parsed.length > 100000 ||
        !parsed.every((id) => validId(id) && id !== '__index__')) {
      throw new Error('Secure record index is malformed.');
    }
    return Array.from(new Set(parsed as string[])).sort();
  }

  async set(namespace: SecureRecordNamespace, id: string, plaintext: string): Promise<void> {
    if (!validNamespace(namespace) || !validId(id) || id === '__index__') {
      throw new Error('Invalid secure record namespace or identifier.');
    }
    if (typeof plaintext !== 'string' || Buffer.byteLength(plaintext, 'utf8') > MAX_RECORD_BYTES) {
      throw new Error('Secure record payload must be a string no larger than 5 MiB.');
    }
    await this.withNamespaceLock(namespace, async () => {
      const ids = await this.readIndex(namespace);
      if (!ids.includes(id)) {
        ids.push(id);
        ids.sort();
        // Publish the identifier first. If the process crashes before the record
        // write, list() can repair the stale index entry; the reverse order can
        // leave an encrypted record permanently orphaned and undiscoverable.
        await this.writeRecord(namespace, '__index__', JSON.stringify(ids));
      }
      await this.writeRecord(namespace, id, plaintext);
    });
  }

  async list(namespace: SecureRecordNamespace): Promise<string[]> {
    if (!validNamespace(namespace)) throw new Error('Invalid secure record namespace.');
    return this.withNamespaceLock(namespace, async () => {
      const ids = await this.readIndex(namespace);
      const verified: string[] = [];
      for (const id of ids) {
        const record = await this.get(namespace, id);
        if (record !== null) verified.push(id);
      }
      if (verified.length !== ids.length) {
        await this.writeRecord(namespace, '__index__', JSON.stringify(verified));
      }
      return verified;
    });
  }

  async get(namespace: SecureRecordNamespace, id: string): Promise<string | null> {
    if (!validNamespace(namespace) || !validId(id)) {
      throw new Error('Invalid secure record namespace or identifier.');
    }
    if (!ensureDirectorySafe(this.rootDir, false)) return null;
    if (!ensureDirectorySafe(path.join(this.rootDir, 'records'), false)) return null;
    if (!ensureDirectorySafe(path.join(this.rootDir, 'records', namespace), false)) {
      return null;
    }

    const filePath = this.recordPath(namespace, id);
    if (!fs.existsSync(filePath)) return null;

    const stat = fs.lstatSync(filePath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      throw new Error('Secure record is not a regular file.');
    }
    if (stat.size > MAX_RECORD_BYTES + 4096) {
      throw new Error('Secure record exceeds the maximum supported size.');
    }

    const envelope = JSON.parse(fs.readFileSync(filePath, 'utf8')) as Partial<Envelope>;
    if (
      envelope.version !== VERSION ||
      envelope.algorithm !== 'aes-256-gcm' ||
      typeof envelope.iv !== 'string' ||
      typeof envelope.authTag !== 'string' ||
      typeof envelope.ciphertext !== 'string'
    ) {
      throw new Error('Secure record envelope is malformed or unsupported.');
    }

    const iv = Buffer.from(envelope.iv, 'base64');
    const tag = Buffer.from(envelope.authTag, 'base64');
    const ciphertext = Buffer.from(envelope.ciphertext, 'base64');
    if (iv.length !== 12 || tag.length !== 16 || ciphertext.length > MAX_RECORD_BYTES) {
      throw new Error('Secure record envelope has invalid cryptographic fields.');
    }

    const key = await this.getKey();
    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(
      Buffer.from('iac-secure-record:v' + VERSION + ':' + namespace + ':' + id, 'utf8')
    );
    decipher.setAuthTag(tag);

    try {
      return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
    } catch {
      throw new Error('Secure record authentication failed.');
    }
  }

  async delete(namespace: SecureRecordNamespace, id: string): Promise<boolean> {
    if (!validNamespace(namespace) || !validId(id) || id === '__index__') {
      throw new Error('Invalid secure record namespace or identifier.');
    }
    return this.withNamespaceLock(namespace, async () => {
      if (
        !ensureDirectorySafe(this.rootDir, false) ||
        !ensureDirectorySafe(path.join(this.rootDir, 'records'), false) ||
        !ensureDirectorySafe(path.join(this.rootDir, 'records', namespace), false)
      ) return false;
      const indexedIds = await this.readIndex(namespace);
      const ids = indexedIds.filter((entry) => entry !== id);
      const filePath = this.recordPath(namespace, id);
      if (!fs.existsSync(filePath)) {
        if (ids.length !== indexedIds.length) {
          await this.writeRecord(namespace, '__index__', JSON.stringify(ids));
        }
        return false;
      }
      const stat = fs.lstatSync(filePath);
      if (!stat.isFile() || stat.isSymbolicLink()) {
        throw new Error('Secure record is not a regular file.');
      }
      fs.unlinkSync(filePath);
      await this.writeRecord(namespace, '__index__', JSON.stringify(ids));
      return true;
    });
  }
}
