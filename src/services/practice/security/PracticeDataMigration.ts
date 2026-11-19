/**
 * Explicit migration of legacy practice data from renderer localStorage into
 * Electron's OS-backed encrypted record store.
 *
 * The migration never deletes or mutates the legacy source. It is safe to rerun:
 * identical encrypted records are verified and skipped; conflicting encrypted
 * records are reported and never overwritten.
 */

export const PRACTICE_LEGACY_STORAGE_KEYS = [
  'ai_practice_active_session_v1',
  'ai_practice_sessions_v1',
  'ai_practice_stories_v1',
  'ai_practice_topics_v1',
  'ai_practice_company_plans_v1',
  'ai_practice_feedback_v1',
  'ai_practice_weakness_plan_v1',
  'ai_practice_explainer_attempts_v1',
  'ai_practice_concept_cards_v1',
] as const;

export type PracticeLegacyStorageKey = (typeof PRACTICE_LEGACY_STORAGE_KEYS)[number];

export interface PracticeMigrationPreview {
  available: boolean;
  records: Array<{ key: PracticeLegacyStorageKey; bytes: number }>;
  totalRecords: number;
  totalBytes: number;
}

export interface PracticeMigrationResult {
  migrated: string[];
  verified: string[];
  conflicts: string[];
  failed: Array<{ key: string; reason: string }>;
  sourcePreserved: true;
}

interface MigrationJournal {
  version: 1;
  updatedAt: string;
  completed: string[];
  conflicts: string[];
  failed: string[];
}

const JOURNAL_ID = 'practice_migration_v1';

function requireSecureStorage(): NonNullable<Window['electronAPI']> {
  if (
    typeof window === 'undefined' ||
    !window.electronAPI?.secureRecordGet ||
    !window.electronAPI?.secureRecordSet
  ) {
    throw new Error(
      'Encrypted desktop storage is unavailable. Legacy practice data was not changed.'
    );
  }
  return window.electronAPI;
}

/** Read-only inventory. Does not copy, modify, or delete any source record. */
export function previewPracticeDataMigration(): PracticeMigrationPreview {
  const available =
    typeof window !== 'undefined' &&
    typeof window.localStorage !== 'undefined' &&
    !!window.electronAPI?.secureRecordGet &&
    !!window.electronAPI?.secureRecordSet;

  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return { available: false, records: [], totalRecords: 0, totalBytes: 0 };
  }

  const records: PracticeMigrationPreview['records'] = [];
  for (const key of PRACTICE_LEGACY_STORAGE_KEYS) {
    const value = window.localStorage.getItem(key);
    if (value !== null) {
      records.push({ key, bytes: new TextEncoder().encode(value).byteLength });
    }
  }

  return {
    available,
    records,
    totalRecords: records.length,
    totalBytes: records.reduce((total, record) => total + record.bytes, 0),
  };
}

/**
 * Run only after an explicit user action. Each write is read back and compared
 * byte-for-byte before the journal marks it complete. The plaintext source is
 * deliberately retained for export/rollback until the user separately approves
 * cleanup in a future workflow.
 */
export async function migratePracticeDataToEncryptedStorage(): Promise<PracticeMigrationResult> {
  const api = requireSecureStorage();
  if (typeof window.localStorage === 'undefined') {
    throw new Error('Legacy browser storage is unavailable.');
  }

  const journalRaw = await api.secureRecordGet('practice', JOURNAL_ID);
  let journal: MigrationJournal = {
    version: 1,
    updatedAt: new Date().toISOString(),
    completed: [],
    conflicts: [],
    failed: [],
  };

  if (journalRaw) {
    try {
      const parsed = JSON.parse(journalRaw) as MigrationJournal;
      if (
        parsed?.version === 1 &&
        Array.isArray(parsed.completed) &&
        Array.isArray(parsed.conflicts) &&
        Array.isArray(parsed.failed)
      ) {
        journal = parsed;
      }
    } catch {
      throw new Error('Encrypted practice migration journal is malformed; source data retained.');
    }
  }

  const result: PracticeMigrationResult = {
    migrated: [],
    verified: [],
    conflicts: [],
    failed: [],
    sourcePreserved: true,
  };

  for (const key of PRACTICE_LEGACY_STORAGE_KEYS) {
    const source = window.localStorage.getItem(key);
    if (source === null) continue;

    try {
      const existing = await api.secureRecordGet('practice', key);
      if (existing !== null) {
        if (existing === source) {
          result.verified.push(key);
          if (!journal.completed.includes(key)) journal.completed.push(key);
        } else {
          result.conflicts.push(key);
          if (!journal.conflicts.includes(key)) journal.conflicts.push(key);
        }
      } else {
        await api.secureRecordSet('practice', key, source);
        const roundTrip = await api.secureRecordGet('practice', key);
        if (roundTrip !== source) {
          throw new Error('Encrypted read-back did not match the source record.');
        }
        result.migrated.push(key);
        if (!journal.completed.includes(key)) journal.completed.push(key);
      }
    } catch {
      result.failed.push({ key, reason: 'Encrypted write or verification failed.' });
      if (!journal.failed.includes(key)) journal.failed.push(key);
    }

    journal.updatedAt = new Date().toISOString();
    try {
      const serializedJournal = JSON.stringify(journal);
      await api.secureRecordSet('practice', JOURNAL_ID, serializedJournal);
      const verifiedJournal = await api.secureRecordGet('practice', JOURNAL_ID);
      if (verifiedJournal !== serializedJournal) {
        throw new Error('Practice migration journal verification failed.');
      }
    } catch {
      // The copied record remains verified; a later run safely rechecks it.
      result.failed.push({ key: JOURNAL_ID, reason: 'Migration journal could not be verified.' });
    }
  }

  return result;
}
