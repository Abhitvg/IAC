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


  it('does not reactivate the microphone when permission resolves after Stop', async () => {
    let resolvePermission: ((stream: MediaStream) => void) | undefined;
    const stopTrack = vi.fn();
    const stream = {
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolvePermission = resolve;
        })
    );
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    const recorder = new AudioRecorder();
    const startup = recorder.start(() => undefined);

    expect(recorder.getCaptureState()).toBe('starting');
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));

    await recorder.stop();
    expect(recorder.getCaptureState()).toBe('stopped');

    resolvePermission?.(stream);
    await startup;

    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(recorder.getCaptureState()).toBe('stopped');
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    expect(
      DiagnosticLoggerService.getInstance()
        .getEvents()
        .map((event) => event.audioCaptureOutcome)
    ).toEqual(['STARTING', 'STOPPED']);
  });

  it('shares one pending permission request when Start is triggered repeatedly', async () => {
    let resolvePermission: ((stream: MediaStream) => void) | undefined;
    const stopTrack = vi.fn();
    const stream = {
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream;
    const getUserMedia = vi.fn(
      () =>
        new Promise<MediaStream>((resolve) => {
          resolvePermission = resolve;
        })
    );
    vi.stubGlobal('navigator', { mediaDevices: { getUserMedia } });

    const recorder = new AudioRecorder();
    const firstStart = recorder.start(() => undefined);
    const secondStart = recorder.start(() => undefined);

    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledTimes(1));
    expect(recorder.getCaptureState()).toBe('starting');

    await recorder.stop();
    resolvePermission?.(stream);
    await Promise.all([firstStart, secondStart]);

    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(recorder.getCaptureState()).toBe('stopped');
  });

  it('cleans up a pending AudioContext resume after Stop without activating capture', async () => {
    let resolveResume: (() => void) | undefined;
    const resume = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveResume = resolve;
        })
    );
    const close = vi.fn(async () => undefined);
    const stopTrack = vi.fn();
    const stream = {
      getTracks: () => [{ stop: stopTrack }],
    } as unknown as MediaStream;

    class DeferredAudioContext {
      state: AudioContextState = 'suspended';
      destination = {} as AudioDestinationNode;
      resume = resume;
      close = close;
      createMediaStreamSource = vi.fn();
      createScriptProcessor = vi.fn();
      createGain = vi.fn();
    }

    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    vi.stubGlobal('window', { AudioContext: DeferredAudioContext });

    const recorder = new AudioRecorder();
    const startup = recorder.start(() => undefined);
    await vi.waitFor(() => expect(resume).toHaveBeenCalledTimes(1));

    await recorder.stop();
    expect(recorder.getCaptureState()).toBe('stopped');

    resolveResume?.();
    await startup;

    expect(stopTrack).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(recorder.getCaptureState()).toBe('stopped');
    expect(
      DiagnosticLoggerService.getInstance()
        .getEvents()
        .map((event) => event.audioCaptureOutcome)
    ).toEqual(['STARTING', 'STOPPED']);
  });

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
