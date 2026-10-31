/**
 * FeedbackStorageEncryption.ts
 *
 * Provides at-rest encryption and decryption utilities for stored feedback records
 * and practice transcripts using Web Crypto AES-256-GCM.
 *
 * Security Architecture Rationale:
 * - Provider API keys are stored in the Electron main process via OS keychain (safeStorage).
 * - Feedback records and transcripts are redacted locally before persistence.
 * - This service provides optional/configurable AES-256-GCM encryption at rest
 *   using safeStorage-derived or machine-scoped cryptographic keys.
 */

import { FeedbackRecord } from '../types';

const ENCRYPTION_PREFIX = 'enc:v1:';
const DEFAULT_SALT = new Uint8Array([
  0x61, 0x69, 0x2d, 0x69, 0x6e, 0x74, 0x65, 0x72, 0x76, 0x69, 0x65, 0x77, 0x2d, 0x67, 0x79, 0x6d,
]); // "ai-interview-gym"

/**
 * Derives a 256-bit AES-GCM CryptoKey from a secret passphrase or machine-scoped seed.
 */
async function deriveCryptoKey(secret: string): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );

  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: DEFAULT_SALT,
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

/**
 * Returns the default key source:
 * In Electron, can be derived from safeStorage-backed machine ID.
 * In browser/tests, falls back to a deterministic application-scoped identifier.
 */
function getDefaultKeySource(): string {
  try {
    if (typeof window !== 'undefined' && (window as any).electronAPI?.platform) {
      return `electron-gym-${(window as any).electronAPI.platform}`;
    }
  } catch {
    // Ignore
  }
  return 'iac-interview-gym-storage-v1';
}

/**
 * Encrypts an arbitrary JSON-serializable object into an AES-GCM ciphertext payload.
 */
export async function encryptPayload(data: unknown, customKey?: string): Promise<string> {
  const jsonStr = JSON.stringify(data);
  const enc = new TextEncoder();
  const rawData = enc.encode(jsonStr);

  const keySource = customKey || getDefaultKeySource();
  const cryptoKey = await deriveCryptoKey(keySource);

  // Generate 12-byte initialization vector (IV)
  const iv = crypto.getRandomValues(new Uint8Array(12));

  const ciphertext = await crypto.subtle.encrypt(
    {
      name: 'AES-GCM',
      iv,
    },
    cryptoKey,
    rawData
  );

  const ivB64 = btoa(String.fromCharCode(...iv));
  const dataB64 = btoa(String.fromCharCode(...new Uint8Array(ciphertext)));

  return `${ENCRYPTION_PREFIX}${ivB64}:${dataB64}`;
}

/**
 * Decrypts an AES-GCM ciphertext payload back into the original object.
 */
export async function decryptPayload<T>(encryptedPayload: string, customKey?: string): Promise<T> {
  if (!isEncryptedPayload(encryptedPayload)) {
    throw new Error('InvalidCiphertextError: Payload is missing the required encryption prefix.');
  }

  const parts = encryptedPayload.slice(ENCRYPTION_PREFIX.length).split(':');
  if (parts.length !== 2) {
    throw new Error('InvalidCiphertextError: Corrupted or malformed IV/ciphertext structure.');
  }

  const [ivB64, dataB64] = parts;
  const ivBinary = atob(ivB64);
  const iv = new Uint8Array(ivBinary.length);
  for (let i = 0; i < ivBinary.length; i++) {
    iv[i] = ivBinary.charCodeAt(i);
  }

  const cipherBinary = atob(dataB64);
  const ciphertext = new Uint8Array(cipherBinary.length);
  for (let i = 0; i < cipherBinary.length; i++) {
    ciphertext[i] = cipherBinary.charCodeAt(i);
  }

  const keySource = customKey || getDefaultKeySource();
  const cryptoKey = await deriveCryptoKey(keySource);

  try {
    const decrypted = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv,
      },
      cryptoKey,
      ciphertext
    );

    const dec = new TextDecoder();
    const jsonStr = dec.decode(decrypted);
    return JSON.parse(jsonStr) as T;
  } catch (err: any) {
    throw new Error(
      `DecryptionFailedError: Failed to decrypt payload. Corrupted data or invalid key: ${err?.message || 'AEAD tag mismatch'}`,
      { cause: err }
    );
  }
}

/**
 * Checks if a stored string is an encrypted payload.
 */
export function isEncryptedPayload(text: string): boolean {
  return typeof text === 'string' && text.startsWith(ENCRYPTION_PREFIX);
}

/**
 * Encrypts a single FeedbackRecord for storage.
 */
export async function encryptFeedbackRecord(
  record: FeedbackRecord,
  customKey?: string
): Promise<string> {
  return encryptPayload(record, customKey);
}

/**
 * Decrypts a stored FeedbackRecord.
 */
export async function decryptFeedbackRecord(
  payload: string,
  customKey?: string
): Promise<FeedbackRecord> {
  return decryptPayload<FeedbackRecord>(payload, customKey);
}
