/**
 * Explicit migration of the candidate Knowledge Vault from renderer localStorage
 * into Electron's OS-backed encrypted record store.
 *
 * This module is deliberately separate from KnowledgeVaultService so migration
 * can be previewed and invoked only from an explicit user action. It never
 * deletes or mutates the legacy source record.
 */

export const KNOWLEDGE_VAULT_LEGACY_STORAGE_KEY = 'iac_candidate_knowledge_vault_v2';
export const KNOWLEDGE_VAULT_ENCRYPTED_RECORD_ID = 'candidate_knowledge_vault_v2';
export const KNOWLEDGE_VAULT_MIGRATION_JOURNAL_ID = 'knowledge_vault_migration_v1';
export const KNOWLEDGE_VAULT_MAX_RECORD_BYTES = 5 * 1024 * 1024;

export interface KnowledgeVaultMigrationPreview {
  available: boolean;
  recordPresent: boolean;
  bytes: number;
  exceedsEncryptedRecordLimit: boolean;
}

export interface KnowledgeVaultMigrationResult {
  migrated: boolean;
  verified: boolean;
  conflict: boolean;
  failed: boolean;
  reason?: string;
  sourcePreserved: true;
}

interface MigrationJournal {
  version: 1;
  updatedAt: string;
  status: 'verified' | 'conflict' | 'failed';
}

function getSecureApi(): NonNullable<Window['electronAPI']> {
  if (
    typeof window === 'undefined' ||
    !window.electronAPI?.secureRecordGet ||
    !window.electronAPI?.secureRecordSet
  ) {
    throw new Error(
      'Encrypted desktop storage is unavailable. The Knowledge Vault source was not changed.'
    );
  }
  return window.electronAPI;
}

/** Read-only inventory. It never copies, changes, or deletes source data. */
export function previewKnowledgeVaultMigration(): KnowledgeVaultMigrationPreview {
  const available =
    typeof window !== 'undefined' &&
    typeof window.localStorage !== 'undefined' &&
    !!window.electronAPI?.secureRecordGet &&
    !!window.electronAPI?.secureRecordSet;

  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return {
      available: false,
      recordPresent: false,
      bytes: 0,
      exceedsEncryptedRecordLimit: false,
    };
  }

  const source = window.localStorage.getItem(KNOWLEDGE_VAULT_LEGACY_STORAGE_KEY);
  const bytes = source === null ? 0 : new TextEncoder().encode(source).byteLength;

  return {
    available,
    recordPresent: source !== null,
    bytes,
    exceedsEncryptedRecordLimit: bytes > KNOWLEDGE_VAULT_MAX_RECORD_BYTES,
  };
}

/**
 * Copy the legacy vault only after explicit invocation. A write is not reported
 * as successful until the encrypted record is read back byte-for-byte.
 * Conflicting encrypted data is never overwritten; legacy source is retained.
 */
export async function migrateKnowledgeVaultToEncryptedStorage(): Promise<KnowledgeVaultMigrationResult> {
  const api = getSecureApi();
  if (typeof window.localStorage === 'undefined') {
    throw new Error('Legacy browser storage is unavailable.');
  }

  const source = window.localStorage.getItem(KNOWLEDGE_VAULT_LEGACY_STORAGE_KEY);
  if (source === null) {
    return {
      migrated: false,
      verified: false,
      conflict: false,
      failed: false,
      reason: 'No legacy Knowledge Vault record exists.',
      sourcePreserved: true,
    };
  }

  const bytes = new TextEncoder().encode(source).byteLength;
  if (bytes > KNOWLEDGE_VAULT_MAX_RECORD_BYTES) {
    return {
      migrated: false,
      verified: false,
      conflict: false,
      failed: true,
      reason: 'The vault exceeds the encrypted record store 5 MiB limit.',
      sourcePreserved: true,
    };
  }

  let result: KnowledgeVaultMigrationResult = {
    migrated: false,
    verified: false,
    conflict: false,
    failed: false,
    sourcePreserved: true,
  };

  try {
    const existing = await api.secureRecordGet(
      'knowledge-vault',
      KNOWLEDGE_VAULT_ENCRYPTED_RECORD_ID
    );

    if (existing !== null && existing !== source) {
      result = {
        ...result,
        conflict: true,
        reason: 'An encrypted Knowledge Vault already exists with different content.',
      };
    } else if (existing === source) {
      result = { ...result, verified: true };
    } else {
      await api.secureRecordSet(
        'knowledge-vault',
        KNOWLEDGE_VAULT_ENCRYPTED_RECORD_ID,
        source
      );

      const roundTrip = await api.secureRecordGet(
        'knowledge-vault',
        KNOWLEDGE_VAULT_ENCRYPTED_RECORD_ID
      );
      if (roundTrip !== source) {
        throw new Error('Encrypted read-back did not match the legacy source.');
      }
      result = { ...result, migrated: true, verified: true };
    }
  } catch {
    result = {
      ...result,
      failed: true,
      reason: 'Encrypted write or verification failed. The legacy source was retained.',
    };
  }

  const journal: MigrationJournal = {
    version: 1,
    updatedAt: new Date().toISOString(),
    status: result.conflict ? 'conflict' : result.failed ? 'failed' : 'verified',
  };

  try {
    await api.secureRecordSet(
      'knowledge-vault',
      KNOWLEDGE_VAULT_MIGRATION_JOURNAL_ID,
      JSON.stringify(journal)
    );
  } catch {
    return {
      ...result,
      failed: true,
      reason: 'Migration result could not be journaled. The legacy source was retained.',
    };
  }

  return result;
}
