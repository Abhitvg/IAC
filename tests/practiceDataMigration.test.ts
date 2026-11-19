import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  migratePracticeDataToEncryptedStorage,
  previewPracticeDataMigration,
} from '../src/services/practice/security/PracticeDataMigration';

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    values,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('practice data migration', () => {
  it('previews legacy records without changing source storage', () => {
    const localStorage = createStorage({
      ai_practice_feedback_v1: '[{"id":"feedback-1"}]',
      ai_practice_stories_v1: '[]',
    });
    vi.stubGlobal('window', {
      localStorage,
      electronAPI: { secureRecordGet: vi.fn(), secureRecordSet: vi.fn() },
    });

    const preview = previewPracticeDataMigration();

    expect(preview.available).toBe(true);
    expect(preview.totalRecords).toBe(2);
    expect(preview.totalBytes).toBeGreaterThan(0);
    expect(localStorage.removeItem).not.toHaveBeenCalled();
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('encrypts, reads back, journals and preserves every plaintext source record', async () => {
    const source = '{"answer":"private interview response"}';
    const localStorage = createStorage({ ai_practice_feedback_v1: source });
    const records = new Map<string, string>();
    const secureRecordGet = vi.fn(
      async (_namespace: string, id: string) => records.get(id) ?? null
    );
    const secureRecordSet = vi.fn(async (_namespace: string, id: string, data: string) => {
      records.set(id, data);
    });
    vi.stubGlobal('window', { localStorage, electronAPI: { secureRecordGet, secureRecordSet } });

    const result = await migratePracticeDataToEncryptedStorage();

    expect(result.migrated).toEqual(['ai_practice_feedback_v1']);
    expect(result.failed).toEqual([]);
    expect(records.get('ai_practice_feedback_v1')).toBe(source);
    expect(records.has('practice_migration_v1')).toBe(true);
    expect(localStorage.getItem('ai_practice_feedback_v1')).toBe(source);
    expect(localStorage.removeItem).not.toHaveBeenCalled();
  });

  it('is idempotent when encrypted content already matches the legacy source', async () => {
    const source = '{"version":1}';
    const localStorage = createStorage({ ai_practice_topics_v1: source });
    const records = new Map([['ai_practice_topics_v1', source]]);
    const secureRecordGet = vi.fn(
      async (_namespace: string, id: string) => records.get(id) ?? null
    );
    const secureRecordSet = vi.fn(async (_namespace: string, id: string, data: string) => {
      records.set(id, data);
    });
    vi.stubGlobal('window', { localStorage, electronAPI: { secureRecordGet, secureRecordSet } });

    const result = await migratePracticeDataToEncryptedStorage();

    expect(result.verified).toEqual(['ai_practice_topics_v1']);
    expect(result.migrated).toEqual([]);
    expect(secureRecordSet).toHaveBeenCalledTimes(1); // journal only
  });

  it('never overwrites a conflicting encrypted record', async () => {
    const localStorage = createStorage({ ai_practice_feedback_v1: 'legacy' });
    const records = new Map([['ai_practice_feedback_v1', 'newer-encrypted-value']]);
    const secureRecordGet = vi.fn(
      async (_namespace: string, id: string) => records.get(id) ?? null
    );
    const secureRecordSet = vi.fn(async (_namespace: string, id: string, data: string) => {
      records.set(id, data);
    });
    vi.stubGlobal('window', { localStorage, electronAPI: { secureRecordGet, secureRecordSet } });

    const result = await migratePracticeDataToEncryptedStorage();

    expect(result.conflicts).toEqual(['ai_practice_feedback_v1']);
    expect(records.get('ai_practice_feedback_v1')).toBe('newer-encrypted-value');
    expect(localStorage.getItem('ai_practice_feedback_v1')).toBe('legacy');
  });

  it('fails closed when OS-backed encrypted storage is unavailable', async () => {
    const localStorage = createStorage({ ai_practice_feedback_v1: 'legacy' });
    vi.stubGlobal('window', { localStorage, electronAPI: {} });

    await expect(migratePracticeDataToEncryptedStorage()).rejects.toThrow(
      'Encrypted desktop storage is unavailable'
    );
    expect(localStorage.getItem('ai_practice_feedback_v1')).toBe('legacy');
  });
});
