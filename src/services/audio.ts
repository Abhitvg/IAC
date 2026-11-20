import { useAppStore } from '../store/useAppStore';
import { DiagnosticLoggerService } from './diagnosticLogger';
import { downsampleBuffer, encodeWav } from '../utils/audioConversion';

export interface AudioFrameEvent {
  db: number;
  isSpeaking: boolean;
  rms: number;
  deltaMs: number;
}

export type AudioFrameListener = (event: AudioFrameEvent) => void;

export type AudioCaptureState = 'stopped' | 'starting' | 'active' | 'stopping' | 'error';

export class AudioRecorder {
  private static instance: AudioRecorder | null = null;
  private frameListeners: Set<AudioFrameListener> = new Set();
  private lastFrameTime = 0;
  private captureState: AudioCaptureState = 'stopped';
  private captureRequestId: string | null = null;
  private captureStartedAt = 0;
  private captureGeneration = 0;
  private stopPromise: Promise<void> | null = null;

  public static getInstance(): AudioRecorder {
    if (!AudioRecorder.instance) {
      AudioRecorder.instance = new AudioRecorder();
    }
    return AudioRecorder.instance;
  }

  public getCaptureState(): AudioCaptureState {
    return this.captureState;
  }

  public addFrameListener(listener: AudioFrameListener): () => void {
    this.frameListeners.add(listener);
    return () => {
      this.frameListeners.delete(listener);
    };
  }

  private audioContext: AudioContext | null = null;
  private mediaStream: MediaStream | null = null;
  private sourceNode: MediaStreamAudioSourceNode | null = null;
  private processorNode: ScriptProcessorNode | null = null;
  private gainNode: GainNode | null = null;
  private isListening = false;
  private onUtteranceCb: ((blob: Blob) => void) | null = null;

  // 16 kHz Audio buffering
  private readonly TARGET_SAMPLE_RATE = 16000;
  private preRollBuffer: Float32Array = new Float32Array(16000 * 0.4); // 400ms pre-roll
  private preRollIndex = 0;
  private isCapturing = false;
  private utteranceChunks: Float32Array[] = [];
  private totalUtteranceSamples = 0;

  // Voice Activity Detection parameters
  private voiceThreshold = -46; // dB threshold for speech
  private silenceThreshold = -52; // dB threshold for silence
  private lastSpeechTime = 0;
  private speechStartDetectedTime = 0;
  private speechSilenceDuration = 1000; // ms silence before finalizing utterance
  private minUtteranceSamples = 16000 * 0.35; // minimum 0.35s of speech
  private maxUtteranceSamples = 16000 * 35; // 35s max duration guard
  private lastDbUpdate = 0;

  async start(onUtterance: (blob: Blob) => void): Promise<void> {
    // Serialize startup behind an in-progress stop. Re-check after waiting because
    // another caller may already have started the recorder.
    if (this.stopPromise) {
      await this.stopPromise;
      return this.start(onUtterance);
    }

    // Idempotent: repeated Start calls update the callback without creating another
    // permission prompt or microphone stream.
    if (this.captureState === 'active' || this.captureState === 'starting') {
      this.onUtteranceCb = onUtterance;
      return;
    }

    const generation = ++this.captureGeneration;
    this.captureState = 'starting';
    this.isListening = false;
    this.onUtteranceCb = onUtterance;

    // Clear resources left behind by a previously failed setup. This operation
    // deliberately does not invalidate the generation owned by this start.
    await this.releaseCaptureResources();
    if (generation !== this.captureGeneration || this.captureState !== 'starting') return;

    this.captureRequestId = `capture_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    this.captureStartedAt = Date.now();
    DiagnosticLoggerService.getInstance().recordEvent({
      requestId: this.captureRequestId,
      pipelineStage: 'listening',
      audioCaptureOutcome: 'STARTING',
      message: 'Audio capture startup requested.',
    });
    this.isCapturing = false;
    this.utteranceChunks = [];
    this.totalUtteranceSamples = 0;
    this.speechStartDetectedTime = 0;
    this.preRollBuffer.fill(0);
    const storeTolerance = useAppStore.getState().speechPauseTolerance;
    if (typeof storeTolerance === 'number' && storeTolerance >= 400) {
      this.speechSilenceDuration = storeTolerance;
    }
    this.preRollIndex = 0;

    let pendingStream: MediaStream | null = null;
    let pendingContext: AudioContext | null = null;
    let pendingSource: MediaStreamAudioSourceNode | null = null;
    let pendingProcessor: ScriptProcessorNode | null = null;
    let pendingGain: GainNode | null = null;

    const isCurrentStartup = () =>
      generation === this.captureGeneration && this.captureState === 'starting';
    const stopPendingStream = () => {
      pendingStream?.getTracks().forEach((track) => track.stop());
      pendingStream = null;
    };
    const closePendingContext = async () => {
      if (pendingContext && pendingContext.state !== 'closed') {
        await pendingContext.close().catch(() => undefined);
      }
      pendingContext = null;
    };
    const disconnectPendingNodes = () => {
      if (pendingProcessor) {
        pendingProcessor.onaudioprocess = null;
        try {
          pendingProcessor.disconnect();
        } catch {}
        pendingProcessor = null;
      }
      try {
        pendingSource?.disconnect();
      } catch {}
      pendingSource = null;
      try {
        pendingGain?.disconnect();
      } catch {}
      pendingGain = null;
    };

    try {
      const selectedDeviceId = useAppStore.getState().selectedAudioDeviceId;
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {}),
      };

      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('navigator.mediaDevices.getUserMedia is not supported in this environment');
      }

      pendingStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints });
      if (!isCurrentStartup()) {
        stopPendingStream();
        return;
      }

      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCtor) {
        throw new Error('AudioContext is not supported in this environment');
      }
      pendingContext = new AudioContextCtor();
      if (pendingContext.state === 'suspended') {
        await pendingContext.resume();
      }
      if (!isCurrentStartup()) {
        stopPendingStream();
        await closePendingContext();
        return;
      }

      pendingSource = pendingContext.createMediaStreamSource(pendingStream);
      pendingProcessor = pendingContext.createScriptProcessor(1024, 1, 1);
      pendingGain = pendingContext.createGain();
      pendingGain.gain.value = 0;

      // Transfer resource ownership only after all awaited startup steps have
      // passed the generation check. Stop can now safely tear down instance fields.
      this.mediaStream = pendingStream;
      this.audioContext = pendingContext;
      this.sourceNode = pendingSource;
      this.processorNode = pendingProcessor;
      this.gainNode = pendingGain;
      pendingStream = null;
      pendingContext = null;
      pendingSource = null;
      pendingProcessor = null;
      pendingGain = null;

      this.processorNode.onaudioprocess = (e) => {
        if (!this.isListening || generation !== this.captureGeneration) return;
        const channelData = e.inputBuffer.getChannelData(0);
        this.processAudioFrame(channelData);
      };

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      if (!isCurrentStartup()) {
        await this.releaseCaptureResources();
        return;
      }

      this.isListening = true;
      this.captureState = 'active';
      if (this.captureRequestId) {
        DiagnosticLoggerService.getInstance().recordEvent({
          requestId: this.captureRequestId,
          pipelineStage: 'listening',
          audioCaptureOutcome: 'ACTIVE',
          message: 'Microphone capture pipeline is active.',
        });
      }
      useAppStore.getState().updateDiagnostics({
        micActive: true,
        mimeType: 'audio/wav (16kHz mono PCM)',
      });
    } catch (e: any) {
      disconnectPendingNodes();
      stopPendingStream();
      await closePendingContext();
      // A synchronous graph-connect failure can happen after ownership moved to
      // instance fields. Release those as well before reporting the setup error.
      await this.releaseCaptureResources();

      // Stop or a newer start owns the state now. A cancelled permission request
      // must not surface as a microphone failure or overwrite the replacement state.
      if (!isCurrentStartup()) return;

      this.isListening = false;
      this.captureState = 'error';
      this.onUtteranceCb = null;
      if (this.captureRequestId) {
        DiagnosticLoggerService.getInstance().recordEvent({
          requestId: this.captureRequestId,
          pipelineStage: 'failed',
          audioCaptureDurationMs: Date.now() - this.captureStartedAt,
          audioCaptureOutcome: 'FAILED',
          finalOutcome: 'FAILED',
          message: 'Audio capture failed before the microphone pipeline became active.',
        });
        this.captureRequestId = null;
        this.captureStartedAt = 0;
      }
      useAppStore.getState().updateDiagnostics({
        micActive: false,
        whisperStatus: 'Mic error: ' + (e?.message || e),
      });
      throw e;
    }
  }

  private async releaseCaptureResources(): Promise<void> {
    if (this.processorNode) {
      this.processorNode.onaudioprocess = null;
      try {
        this.processorNode.disconnect();
      } catch {}
      this.processorNode = null;
    }

    if (this.sourceNode) {
      try {
        this.sourceNode.disconnect();
      } catch {}
      this.sourceNode = null;
    }

    if (this.gainNode) {
      try {
        this.gainNode.disconnect();
      } catch {}
      this.gainNode = null;
    }

    const stream = this.mediaStream;
    this.mediaStream = null;
    stream?.getTracks().forEach((track) => track.stop());

    const context = this.audioContext;
    this.audioContext = null;
    if (context && context.state !== 'closed') {
      await context.close().catch(() => undefined);
    }
  }

  private processAudioFrame(inputData: Float32Array): void {
    // 1. Calculate RMS / decibels
    let sumSquares = 0;
    for (let i = 0; i < inputData.length; i++) {
      sumSquares += inputData[i] * inputData[i];
    }
    const rms = Math.sqrt(sumSquares / inputData.length);
    const db = Math.round(20 * Math.log10(rms || 0.00001));

    const now = Date.now();
    const deltaMs = this.lastFrameTime > 0 ? Math.min(100, now - this.lastFrameTime) : 21;
    this.lastFrameTime = now;

    // Instant frame dispatch to subscribers (< 21ms latency)
    const isSpeaking = db > this.voiceThreshold;
    if (this.frameListeners.size > 0) {
      const event: AudioFrameEvent = { db, isSpeaking, rms, deltaMs };
      for (const listener of this.frameListeners) {
        try {
          listener(event);
        } catch (err) {
          console.error('[AudioRecorder] Frame listener error:', err);
        }
      }
    }

    if (now - this.lastDbUpdate > 100) {
      this.lastDbUpdate = now;
      useAppStore.getState().updateDiagnostics({ currentDb: db });
    }

    // 2. Resample frame to 16,000 Hz
    const resampled = downsampleBuffer(
      inputData,
      this.audioContext?.sampleRate || 48000,
      this.TARGET_SAMPLE_RATE
    );

    // 3. Update circular pre-roll buffer when not capturing
    if (!this.isCapturing) {
      for (let i = 0; i < resampled.length; i++) {
        this.preRollBuffer[this.preRollIndex] = resampled[i];
        this.preRollIndex = (this.preRollIndex + 1) % this.preRollBuffer.length;
      }
    }

    // 4. Voice Activity Detection
    if (db > this.voiceThreshold) {
      this.lastSpeechTime = now;
      if (!this.isCapturing) {
        if (this.speechStartDetectedTime === 0) {
          this.speechStartDetectedTime = now;
        } else if (now - this.speechStartDetectedTime >= 60) {
          // Speech confirmed: start capturing utterance with pre-roll
          this.isCapturing = true;
          useAppStore.getState().updateDiagnostics({ speechDetected: true });

          // Unwrap circular pre-roll buffer
          const preRoll = new Float32Array(this.preRollBuffer.length);
          const firstPart = this.preRollBuffer.subarray(this.preRollIndex);
          const secondPart = this.preRollBuffer.subarray(0, this.preRollIndex);
          preRoll.set(firstPart, 0);
          preRoll.set(secondPart, firstPart.length);

          this.utteranceChunks = [preRoll, resampled];
          this.totalUtteranceSamples = preRoll.length + resampled.length;
          return;
        }
      }
    } else {
      if (!this.isCapturing) {
        this.speechStartDetectedTime = 0;
      }
    }

    // 5. Append chunks if capturing
    if (this.isCapturing) {
      this.utteranceChunks.push(resampled);
      this.totalUtteranceSamples += resampled.length;

      const currentSilenceDuration =
        useAppStore.getState().speechPauseTolerance || this.speechSilenceDuration;
      const isSilenceTimeout =
        db < this.silenceThreshold && now - this.lastSpeechTime >= currentSilenceDuration;
      const isMaxDurationReached = this.totalUtteranceSamples >= this.maxUtteranceSamples;

      if (isSilenceTimeout || isMaxDurationReached) {
        this.finalizeUtterance();
      }
    }
  }

  private finalizeUtterance(): void {
    this.isCapturing = false;
    this.speechStartDetectedTime = 0;
    useAppStore.getState().updateDiagnostics({ speechDetected: false });

    if (this.totalUtteranceSamples >= this.minUtteranceSamples && this.onUtteranceCb) {
      const fullAudio = new Float32Array(this.totalUtteranceSamples);
      let offset = 0;
      for (const chunk of this.utteranceChunks) {
        fullAudio.set(chunk, offset);
        offset += chunk.length;
      }

      const wavBlob = encodeWav(fullAudio, this.TARGET_SAMPLE_RATE);
      useAppStore.getState().updateDiagnostics({
        blobSize: wavBlob.size,
        whisperStatus: 'WAV recorded: ' + wavBlob.size + ' bytes',
      });

      this.onUtteranceCb(wavBlob);
    }

    this.utteranceChunks = [];
    this.totalUtteranceSamples = 0;
  }

  setSilenceDuration(ms: number): void {
    this.speechSilenceDuration = Math.max(400, Math.min(3500, ms));
  }

  getSilenceDuration(): number {
    return this.speechSilenceDuration;
  }

  /**
   * Stop audio recording.
   * @param flush If true, flushes and finalizes any in-progress speech.
   *              If false (default), discards in-progress buffer to avoid triggering unwanted requests on stop.
   */
  async stop(flush: boolean = false, outcome: 'STOPPED' | 'ABORTED' = 'STOPPED'): Promise<void> {
    // Invalidate pending permission/resume continuations synchronously.
    const generation = ++this.captureGeneration;

    if (this.stopPromise) {
      const pendingStop = this.stopPromise;
      await pendingStop;
      if (generation === this.captureGeneration) this.captureState = 'stopped';
      return;
    }

    if (
      this.captureState === 'stopped' &&
      !this.mediaStream &&
      !this.audioContext &&
      !this.captureRequestId
    ) {
      return;
    }

    this.captureState = 'stopping';
    this.isListening = false;

    if (this.isCapturing) {
      if (flush) {
        this.finalizeUtterance();
      } else {
        this.isCapturing = false;
        this.utteranceChunks = [];
        this.totalUtteranceSamples = 0;
        this.speechStartDetectedTime = 0;
      }
    }

    this.onUtteranceCb = null;
    const requestId = this.captureRequestId;
    const captureStartedAt = this.captureStartedAt;
    this.captureRequestId = null;
    this.captureStartedAt = 0;

    const stopOperation = (async () => {
      await this.releaseCaptureResources();
      if (generation === this.captureGeneration) this.captureState = 'stopped';

      if (requestId) {
        DiagnosticLoggerService.getInstance().recordEvent({
          requestId,
          pipelineStage: outcome === 'STOPPED' ? 'listening' : 'failed',
          audioCaptureDurationMs: Date.now() - captureStartedAt,
          audioCaptureOutcome: outcome,
          finalOutcome: outcome === 'STOPPED' ? 'SUCCESS' : 'ABORTED',
          message:
            outcome === 'STOPPED'
              ? 'Audio capture session stopped.'
              : 'Audio capture session cancelled.',
        });
      }
      useAppStore.getState().updateDiagnostics({
        micActive: false,
        speechDetected: false,
      });
    })();

    this.stopPromise = stopOperation;
    try {
      await stopOperation;
    } finally {
      if (this.stopPromise === stopOperation) this.stopPromise = null;
    }
  }

  async cancel(): Promise<void> {
    await this.stop(false, 'ABORTED');
  }
}
