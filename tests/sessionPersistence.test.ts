import { afterEach, describe, expect, it, vi } from 'vitest';
import { saveSession } from '../src/services/session';
import type { InterviewSession } from '../src/types';

describe('session persistence', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('writes one canonical session record instead of independently writing sidecars', async () => {
    const writeFile = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('window', { electronAPI: { writeFile } });

    const session: InterviewSession = {
      id: 'session-123',
      date: '2026-11-16',
      startTime: '2026-11-16T00:00:00.000Z',
      questions: [
        {
          id: 'question-1',
          question: 'What is a hash map?',
          category: 'DSA',
          difficulty: 'Easy',
          answer: 'A key-value data structure.',
          timestamp: '2026-11-16T00:01:00.000Z',
          responseTime: 2,
        },
      ],
      performance: {
        totalQuestions: 1,
        categoryCounts: { DSA: 1 },
        strongAreas: ['DSA'],
        weakAreas: [],
        averageResponseTime: 2,
        recommendations: [],
      },
    };

    await saveSession(session, '/user-data/sessions');

    expect(writeFile).toHaveBeenCalledTimes(1);
    expect(writeFile).toHaveBeenCalledWith(
      '/user-data/sessions/2026-11-16/session_session-123.json',
      JSON.stringify(session, null, 2)
    );
  });

  it('propagates persistence failures so callers cannot report a false save success', async () => {
    const writeFile = vi.fn().mockRejectedValue(new Error('disk full'));
    vi.stubGlobal('window', { electronAPI: { writeFile } });

    await expect(
      saveSession(
        {
          id: 'session-456',
          date: '2026-11-16',
          startTime: '2026-11-16T00:00:00.000Z',
          questions: [],
        },
        '/user-data/sessions'
      )
    ).rejects.toThrow('disk full');
  });
});
