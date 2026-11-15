import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../src/services/InterviewEngine', () => ({
  InterviewEngine: {
    handleEvent: vi.fn(),
    abortActiveGeneration: vi.fn(),
    markQuestionPendingFinalization: vi.fn(),
    cancelAllActiveWork: vi.fn(),
  },
}));

import { AudioRecorder } from '../src/services/audio';
import { DiagnosticLoggerService } from '../src/services/diagnosticLogger';

describe('audio capture diagnostics', () => {
  beforeEach(() => DiagnosticLoggerService.getInstance().clear());
  afterEach(() => vi.unstubAllGlobals());

  it('records microphone setup failure without logging microphone or transcript content', async () => {
    vi.stubGlobal('navigator', { mediaDevices: undefined });
    const recorder = new AudioRecorder();

    await expect(recorder.start(() => undefined)).rejects.toThrow();
    expect(recorder.getCaptureState()).toBe('error');

    const events = DiagnosticLoggerService.getInstance()
      .getEvents()
      .filter((event) => event.requestId.startsWith('capture_'));
    expect(events).toHaveLength(2);
    expect(events[0].audioCaptureOutcome).toBe('STARTING');
    expect(events[1].audioCaptureOutcome).toBe('FAILED');
    expect(events[1].audioCaptureDurationMs).toBeGreaterThanOrEqual(0);
    expect(events[1].message).not.toContain('navigator');
  });
});
