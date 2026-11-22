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
import { useAppStore } from '../src/store/useAppStore';

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

  it('rejects a microphone track that ends while AudioContext startup is pending', async () => {
    let readyState: MediaStreamTrackState = 'live';
    let resolveResume: (() => void) | undefined;
    const trackStop = vi.fn();
    const track = {
      kind: 'audio',
      get readyState() {
        return readyState;
      },
      stop: trackStop,
    } as unknown as MediaStreamTrack;
    const stream = {
      getTracks: () => [track],
      getAudioTracks: () => [track],
    } as unknown as MediaStream;
    const resume = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveResume = resolve;
        })
    );
    const close = vi.fn(async () => undefined);

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

    readyState = 'ended';
    resolveResume?.();

    await expect(startup).rejects.toThrow('Microphone input ended during startup');
    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(recorder.getCaptureState()).toBe('error');
    expect(useAppStore.getState().diagnosticState.micActive).toBe(false);
    expect(
      DiagnosticLoggerService.getInstance()
        .getEvents()
        .map((event) => event.audioCaptureOutcome)
    ).toEqual(['STARTING', 'FAILED']);
  });

  it('activates a valid microphone capture and releases it on Stop', async () => {
    const trackStop = vi.fn();
    const stream = {
      getTracks: () => [{ stop: trackStop }],
    } as unknown as MediaStream;
    const sourceNode = { connect: vi.fn(), disconnect: vi.fn() };
    const processorNode = {
      onaudioprocess: null as ((event: AudioProcessingEvent) => void) | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const gainNode = {
      gain: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    class ActiveAudioContext {
      state: AudioContextState = 'running';
      sampleRate = 48000;
      destination = {} as AudioDestinationNode;
      resume = vi.fn(async () => undefined);
      close = vi.fn(async () => {
        this.state = 'closed';
      });
      createMediaStreamSource = vi.fn(() => sourceNode);
      createScriptProcessor = vi.fn(() => processorNode);
      createGain = vi.fn(() => gainNode);
    }

    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    vi.stubGlobal('window', { AudioContext: ActiveAudioContext });

    const recorder = new AudioRecorder();
    await recorder.start(() => undefined);

    expect(recorder.getCaptureState()).toBe('active');
    expect(sourceNode.connect).toHaveBeenCalledWith(processorNode);
    expect(processorNode.connect).toHaveBeenCalledWith(gainNode);
    expect(gainNode.gain.value).toBe(0);
    expect(
      DiagnosticLoggerService.getInstance()
        .getEvents()
        .map((event) => event.audioCaptureOutcome)
    ).toEqual(['STARTING', 'ACTIVE']);

    await recorder.stop();

    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(recorder.getCaptureState()).toBe('stopped');
    expect(
      DiagnosticLoggerService.getInstance()
        .getEvents()
        .map((event) => event.audioCaptureOutcome)
    ).toEqual(['STARTING', 'ACTIVE', 'STOPPED']);
  });

  it('marks capture failed and releases resources when the physical audio track ends', async () => {
    let endedListener: (() => void) | undefined;
    const trackStop = vi.fn();
    const addEventListener = vi.fn((type: string, listener: EventListener) => {
      if (type === 'ended') endedListener = () => listener(new Event('ended'));
    });
    const removeEventListener = vi.fn();
    const track = {
      kind: 'audio',
      stop: trackStop,
      addEventListener,
      removeEventListener,
    } as unknown as MediaStreamTrack;
    const stream = {
      getTracks: () => [track],
      getAudioTracks: () => [track],
    } as unknown as MediaStream;

    const sourceNode = { connect: vi.fn(), disconnect: vi.fn() };
    const processorNode = {
      onaudioprocess: null as ((event: AudioProcessingEvent) => void) | null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    const gainNode = {
      gain: { value: 1 },
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    class ActiveAudioContext {
      state: AudioContextState = 'running';
      sampleRate = 48000;
      destination = {} as AudioDestinationNode;
      resume = vi.fn(async () => undefined);
      close = vi.fn(async () => {
        this.state = 'closed';
      });
      createMediaStreamSource = vi.fn(() => sourceNode);
      createScriptProcessor = vi.fn(() => processorNode);
      createGain = vi.fn(() => gainNode);
    }

    vi.stubGlobal('navigator', {
      mediaDevices: { getUserMedia: vi.fn().mockResolvedValue(stream) },
    });
    vi.stubGlobal('window', { AudioContext: ActiveAudioContext });

    const recorder = new AudioRecorder();
    await recorder.start(() => undefined);

    expect(recorder.getCaptureState()).toBe('active');
    expect(useAppStore.getState().diagnosticState.micActive).toBe(true);

    endedListener?.();
    await vi.waitFor(() => expect(recorder.getCaptureState()).toBe('error'));

    expect(trackStop).toHaveBeenCalledTimes(1);
    expect(removeEventListener).toHaveBeenCalledWith('ended', expect.any(Function));
    expect(useAppStore.getState().diagnosticState.micActive).toBe(false);
    expect(useAppStore.getState().diagnosticState.whisperStatus).toContain(
      'Microphone input disconnected'
    );
    expect(useAppStore.getState().toast).toContain('Microphone disconnected');
    expect(
      DiagnosticLoggerService.getInstance()
        .getEvents()
        .map((event) => event.audioCaptureOutcome)
    ).toEqual(['STARTING', 'ACTIVE', 'FAILED']);
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
