import { useAppStore } from "../store/useAppStore";
import { downsampleBuffer, encodeWav } from "../utils/audioConversion";

export class AudioRecorder {
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
  private speechSilenceDuration = 850; // ms silence before finalizing utterance
  private minUtteranceSamples = 16000 * 0.35; // minimum 0.35s of speech
  private maxUtteranceSamples = 16000 * 35; // 35s max duration guard
  private lastDbUpdate = 0;

  async start(onUtterance: (blob: Blob) => void): Promise<void> {
    await this.stop();
    this.onUtteranceCb = onUtterance;
    this.isListening = true;
    this.isCapturing = false;
    this.utteranceChunks = [];
    this.totalUtteranceSamples = 0;
    this.preRollBuffer.fill(0);
    this.preRollIndex = 0;

    try {
      const selectedDeviceId = useAppStore.getState().selectedAudioDeviceId;
      const audioConstraints: MediaTrackConstraints = {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        ...(selectedDeviceId ? { deviceId: { exact: selectedDeviceId } } : {})
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: audioConstraints
      });

      const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
      this.audioContext = new AudioContextCtor();
      if (this.audioContext.state === "suspended") {
        await this.audioContext.resume();
      }

      this.sourceNode = this.audioContext.createMediaStreamSource(this.mediaStream);
      // Buffer size 4096 gives ~85ms chunks at 48kHz, optimal for speech analysis
      this.processorNode = this.audioContext.createScriptProcessor(4096, 1, 1);

      this.processorNode.onaudioprocess = (e) => {
        if (!this.isListening) return;
        const channelData = e.inputBuffer.getChannelData(0);
        this.processAudioFrame(channelData);
      };

      // Mute audio output to prevent loopback/feedback
      this.gainNode = this.audioContext.createGain();
      this.gainNode.gain.value = 0;

      this.sourceNode.connect(this.processorNode);
      this.processorNode.connect(this.gainNode);
      this.gainNode.connect(this.audioContext.destination);

      useAppStore.getState().updateDiagnostics({
        micActive: true,
        mimeType: "audio/wav (16kHz mono PCM)"
      });
    } catch (e: any) {
      this.isListening = false;
      useAppStore.getState().updateDiagnostics({
        micActive: false,
        whisperStatus: "Mic error: " + (e?.message || e)
      });
      throw e;
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

      const isSilenceTimeout =
        db < this.silenceThreshold &&
        now - this.lastSpeechTime >= this.speechSilenceDuration;
      const isMaxDurationReached =
        this.totalUtteranceSamples >= this.maxUtteranceSamples;

      if (isSilenceTimeout || isMaxDurationReached) {
        this.finalizeUtterance();
      }
    }
  }

  private finalizeUtterance(): void {
    this.isCapturing = false;
    this.speechStartDetectedTime = 0;
    useAppStore.getState().updateDiagnostics({ speechDetected: false });

    if (
      this.totalUtteranceSamples >= this.minUtteranceSamples &&
      this.onUtteranceCb
    ) {
      const fullAudio = new Float32Array(this.totalUtteranceSamples);
      let offset = 0;
      for (const chunk of this.utteranceChunks) {
        fullAudio.set(chunk, offset);
        offset += chunk.length;
      }

      const wavBlob = encodeWav(fullAudio, this.TARGET_SAMPLE_RATE);
      useAppStore.getState().updateDiagnostics({
        blobSize: wavBlob.size,
        whisperStatus: "WAV recorded: " + wavBlob.size + " bytes"
      });

      this.onUtteranceCb(wavBlob);
    }

    this.utteranceChunks = [];
    this.totalUtteranceSamples = 0;
  }

  async stop(): Promise<void> {
    this.isListening = false;
    if (this.isCapturing) {
      this.finalizeUtterance();
    }

    if (this.processorNode) {
      this.processorNode.onaudioprocess = null;
      try { this.processorNode.disconnect(); } catch (_) {}
      this.processorNode = null;
    }

    if (this.sourceNode) {
      try { this.sourceNode.disconnect(); } catch (_) {}
      this.sourceNode = null;
    }

    if (this.gainNode) {
      try { this.gainNode.disconnect(); } catch (_) {}
      this.gainNode = null;
    }

    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((t) => t.stop());
      this.mediaStream = null;
    }

    if (this.audioContext && this.audioContext.state !== "closed") {
      await this.audioContext.close().catch(() => undefined);
      this.audioContext = null;
    }

    useAppStore.getState().updateDiagnostics({
      micActive: false,
      speechDetected: false
    });
  }
}
