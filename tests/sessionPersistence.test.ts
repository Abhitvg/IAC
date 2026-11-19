import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { saveSession, loadSessions } from '../src/services/session';
import type { InterviewSession } from '../src/types';
import { DiagnosticLoggerService } from '../src/services/diagnosticLogger';

describe('session persistence', () => {
  beforeEach(() => DiagnosticLoggerService.getInstance().clear());
  afterEach(() => vi.unstubAllGlobals());

  it('writes one canonical encrypted session record', async () => {
    const secureRecordSet = vi.fn().mockResolvedValue(true);
    vi.stubGlobal('window', { electronAPI: { secureRecordSet } });

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

    expect(secureRecordSet).toHaveBeenCalledTimes(1);
    expect(secureRecordSet).toHaveBeenCalledWith(
      'interview-sessions',
      'session-123',
      JSON.stringify(session)
    );
    const saveEvent = DiagnosticLoggerService.getInstance()
      .getEventsForRequest('session_save_session-123')
      .find((event) => event.sessionSaveOutcome === 'SUCCESS');
    expect(saveEvent?.sessionQuestionCount).toBe(1);
    expect(saveEvent?.sessionSaveDurationMs).toBeGreaterThanOrEqual(0);
    expect(saveEvent?.message).not.toContain('What is a hash map?');
  });

  it('refuses plaintext persistence when secure storage is unavailable', async () => {
    vi.stubGlobal('window', { electronAPI: {} });
    await expect(
      saveSession(
        {
          id: 'session-plain-fallback',
          date: '2026-11-16',
          startTime: '2026-11-16T00:00:00.000Z',
          questions: [],
        },
        '/user-data/sessions'
      )
    ).rejects.toThrow('was not written in plaintext');
  });

  it('propagates persistence failures so callers cannot report a false save success', async () => {
    const secureRecordSet = vi.fn().mockRejectedValue(new Error('disk full'));
    vi.stubGlobal('window', { electronAPI: { secureRecordSet } });

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
    const saveEvent = DiagnosticLoggerService.getInstance()
      .getEventsForRequest('session_save_session-456')
      .find((event) => event.sessionSaveOutcome === 'FAILED');
    expect(saveEvent?.finalOutcome).toBe('FAILED');
  });
});
