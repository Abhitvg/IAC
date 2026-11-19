import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePracticeStore } from '../src/store/usePracticeStore';

describe('practice data wipe', () => {
  let legacyRecords: Map<string, string>;
  let encryptedRecords: Map<string, string>;
  let secureRecordGet: ReturnType<typeof vi.fn>;
  let secureRecordDelete: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    legacyRecords = new Map([
      ['ai_practice_active_session_v1', '{"answer":"legacy answer"}'],
      ['ai_practice_feedback_v1', '[{"text":"legacy feedback"}]'],
    ]);
    encryptedRecords = new Map([
      ['ai_practice_active_session_v1', '{"answer":"encrypted answer"}'],
      ['practice_migration_v1', '{"version":1}'],
    ]);
    secureRecordGet = vi.fn(
      async (_namespace: string, id: string) => encryptedRecords.get(id) ?? null
    );
    secureRecordDelete = vi.fn(
      async (_namespace: string, id: string) => encryptedRecords.delete(id)
    );
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => legacyRecords.get(key) ?? null,
        removeItem: (key: string) => legacyRecords.delete(key),
      },
      electronAPI: {
        secureRecordGet,
        secureRecordDelete,
        secureRecordList: async () => Array.from(encryptedRecords.keys()),
      },
    });
  });

  it('deletes both legacy and encrypted practice records and verifies the result', async () => {
    const result = await usePracticeStore.getState().deleteAllFeedbackAndPracticeData();

    expect(result.success).toBe(true);
    expect(result.failedKeys).toEqual([]);
    expect(legacyRecords.size).toBe(0);
    expect(encryptedRecords.size).toBe(0);
    expect(secureRecordDelete).toHaveBeenCalledWith(
      'practice',
      'ai_practice_active_session_v1'
    );
    expect(secureRecordDelete).toHaveBeenCalledWith('practice', 'practice_migration_v1');
    expect(usePracticeStore.getState().activeSession).toBeNull();
    expect(usePracticeStore.getState().feedbackRecords).toEqual([]);
  });

  it('reports incomplete wipe when encrypted storage is unavailable', async () => {
    vi.stubGlobal('window', {
      localStorage: {
        getItem: (key: string) => legacyRecords.get(key) ?? null,
        removeItem: (key: string) => legacyRecords.delete(key),
      },
      electronAPI: {},
    });

    const result = await usePracticeStore.getState().deleteAllFeedbackAndPracticeData();

    expect(result.success).toBe(false);
    expect(result.failedKeys).toContain('encrypted-storage-unavailable');
    expect(legacyRecords.size).toBe(0);
  });

  it('reports encrypted records that could not be deleted', async () => {
    secureRecordDelete.mockResolvedValue(false);

    const result = await usePracticeStore.getState().deleteAllFeedbackAndPracticeData();

    expect(result.success).toBe(false);
    expect(result.failedKeys).toContain('encrypted:ai_practice_active_session_v1');
    expect(encryptedRecords.has('ai_practice_active_session_v1')).toBe(true);
  });
});
