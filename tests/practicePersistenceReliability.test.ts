import { beforeEach, describe, expect, it, vi } from 'vitest';
import { usePracticeStore } from '../src/store/usePracticeStore';

describe('practice encrypted persistence reliability', () => {
  let records: Map<string, string>;
  let secureRecordSet: ReturnType<typeof vi.fn>;
  let secureRecordGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    records = new Map();
    secureRecordSet = vi.fn(async (_namespace: string, id: string, data: string) => {
      records.set(id, data);
    });
    secureRecordGet = vi.fn(async (_namespace: string, id: string) => records.get(id) ?? null);
    vi.stubGlobal('window', {
      localStorage: { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() },
      electronAPI: { secureRecordSet, secureRecordGet },
    });
  });

  it('waits for encrypted write and read-back verification', async () => {
    let releaseWrite: (() => void) | undefined;
    secureRecordSet.mockImplementation(
      async (_namespace: string, id: string, data: string) =>
        new Promise<boolean>((resolve) => {
          releaseWrite = () => {
            records.set(id, data);
            resolve(true);
          };
        })
    );

    usePracticeStore.getState().startMockSession('behavioral');
    expect(
      usePracticeStore.getState().persistenceStatus['ai_practice_active_session_v1']
    ).toBe('pending');

    const flush = usePracticeStore.getState().flushPersistence();
    await Promise.resolve();
    releaseWrite?.();
    await expect(flush).resolves.toBe(true);
    expect(
      usePracticeStore.getState().persistenceStatus['ai_practice_active_session_v1']
    ).toBe('saved');
  });

  it('marks a rejected or unverified encrypted write as an error', async () => {
    secureRecordSet.mockRejectedValue(new Error('secure storage unavailable'));

    usePracticeStore.getState().startMockSession('behavioral');

    await expect(usePracticeStore.getState().flushPersistence()).resolves.toBe(false);
    expect(
      usePracticeStore.getState().persistenceStatus['ai_practice_active_session_v1']
    ).toBe('error');
  });

  it('marks writes unavailable rather than falling back to plaintext', async () => {
    vi.stubGlobal('window', {
      localStorage: { getItem: () => null, setItem: vi.fn(), removeItem: vi.fn() },
      electronAPI: {},
    });

    usePracticeStore.getState().startMockSession('behavioral');

    await expect(usePracticeStore.getState().flushPersistence()).resolves.toBe(false);
    expect(
      usePracticeStore.getState().persistenceStatus['ai_practice_active_session_v1']
    ).toBe('unavailable');
  });

  it('serializes successive writes to the same record', async () => {
    const writeOrder: string[] = [];
    secureRecordSet.mockImplementation(async (_namespace: string, id: string, data: string) => {
      writeOrder.push(data);
      records.set(id, data);
    });

    const store = usePracticeStore.getState();
    store.startMockSession('behavioral');
    usePracticeStore.getState().setCurrentCandidateAnswer('answer draft');
    usePracticeStore.getState().endSession();

    await expect(usePracticeStore.getState().flushPersistence()).resolves.toBe(true);
    expect(writeOrder.length).toBeGreaterThanOrEqual(2);
    expect(records.get('ai_practice_active_session_v1')).toBe('null');
  });
});
