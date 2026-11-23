import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import sophosPracticePack from '../../src/data/questions/sophos_java_software_engineering.json';
import { QuestionBank, QuestionEntrySchema } from '../../src/services/practice/QuestionBank';
import {
  restorePersistedCustomQuestions,
  usePracticeStore,
} from '../../src/store/usePracticeStore';

const CUSTOM_QUESTIONS_KEY = 'ai_practice_custom_questions_v1';

function createMemoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => values.set(key, String(value)),
    removeItem: (key: string) => values.delete(key),
    clear: () => values.clear(),
  };
}

describe('Sophos Java/software-engineering practice pack', () => {
  beforeEach(() => {
    QuestionBank.resetCustomQuestions();
    vi.stubGlobal('localStorage', createMemoryStorage());
  });

  afterEach(() => {
    QuestionBank.resetCustomQuestions();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('contains unique, schema-valid questions across Java, DSA, backend, cloud, and security', () => {
    expect(sophosPracticePack.length).toBeGreaterThanOrEqual(12);

    const ids = new Set<string>();
    for (const question of sophosPracticePack) {
      const parsed = QuestionEntrySchema.safeParse(question);
      const validationMessage = parsed.success ? '' : JSON.stringify(parsed.error.issues);
      expect(parsed.success, `Invalid question ${question.id}: ${validationMessage}`).toBe(true);
      expect(ids.has(question.id)).toBe(false);
      ids.add(question.id);
      expect(question.tags).toContain('sophos');
      expect(question.expectedPoints.length).toBeGreaterThan(0);
    }

    expect(sophosPracticePack.some((question) => question.type === 'coding')).toBe(true);
    expect(sophosPracticePack.some((question) => question.type === 'system_design')).toBe(true);
    expect(sophosPracticePack.some((question) => question.type === 'behavioral')).toBe(true);
  });

  it('rolls back an imported pack when local persistence fails', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new Error('storage quota exceeded');
      },
      removeItem: () => undefined,
      clear: () => undefined,
    });

    const result = usePracticeStore.getState().importCustomQuestionPack(sophosPracticePack);

    expect(result.success).toBe(false);
    expect(result.importedCount).toBe(0);
    expect(QuestionBank.getCustomQuestions()).toHaveLength(0);
    consoleError.mockRestore();
  });

  it('imports, persists, restores, and wipes the pack without losing the question bank', () => {
    const result = usePracticeStore.getState().importCustomQuestionPack(sophosPracticePack);

    expect(result.success).toBe(true);
    expect(result.importedCount).toBe(sophosPracticePack.length);
    expect(QuestionBank.getQuestionById('sophos_java_se_two_sum')).toBeDefined();
    expect(QuestionBank.selectAdaptiveQuestion({ type: 'coding' }).tags).toContain('sophos');
    expect(QuestionBank.selectAdaptiveQuestion({ type: 'system_design' }).tags).toContain('sophos');

    const saved = JSON.parse(localStorage.getItem(CUSTOM_QUESTIONS_KEY) || '[]');
    expect(saved).toHaveLength(sophosPracticePack.length);

    QuestionBank.replaceCustomQuestions([]);
    restorePersistedCustomQuestions();
    expect(QuestionBank.getQuestionById('sophos_java_se_java_overload_override')).toBeDefined();

    const wipe = usePracticeStore.getState().deleteAllFeedbackAndPracticeData();
    expect(wipe.success).toBe(true);
    expect(localStorage.getItem(CUSTOM_QUESTIONS_KEY)).toBeNull();
    expect(QuestionBank.getQuestionById('sophos_java_se_two_sum')).toBeUndefined();
  });
});
