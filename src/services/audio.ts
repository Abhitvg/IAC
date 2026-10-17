import { useAppStore } from '../store/useAppStore';
import { VoiceActivityDetector } from './VoiceActivityDetector';

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private vad: VoiceActivityDetector | null = null;
  private onUtteranceCb: ((blob: Blob) => void) | null = null;
  private isListening = false;
  private activeMimeType = '';
  private maxDurationTimer: any = null;
  private MAX_DURATION = 40000;
  private hasDetectedSpeech = false;

  async start(onUtterance: (blob: Blob) => void): Promise<void> {
    this.onUtteranceCb = onUtterance;
    this.isListening = true;
    this.hasDetectedSpeech = false;

    try {
      // Avoid overconstraining sampleRate (which fails on many Mac / external mics)
      // convertBlobToWav handles proper 16kHz mono resampling in software.
      this.stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        }
      });
      useAppStore.getState().updateDiagnostics({ micActive: true });

      const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg', 'audio/mp4'];
      this.activeMimeType = types.find(t => MediaRecorder.isTypeSupported(t)) || '';
      useAppStore.getState().updateDiagnostics({ mimeType: this.activeMimeType });

      // Start VAD to track voice energy
      this.vad = new VoiceActivityDetector();
      this.vad.start(this.stream);

      // Begin recording continuously so the start of words is never clipped
      this.startNewRecordingSession();

      this.vad.onSpeechStart(() => {
          this.hasDetectedSpeech = true;
          useAppStore.getState().updateDiagnostics({ speechDetected: true });
      });

      this.vad.onSpeechEnd(() => {
          useAppStore.getState().updateDiagnostics({ speechDetected: false });
          if (this.hasDetectedSpeech) {
              this.finalizeUtterance();
          }
      });

    } catch (e: any) {
      this.isListening = false;
      useAppStore.getState().updateDiagnostics({ micActive: false, whisperStatus: 'Mic error: ' + (e?.message || e) });
      throw new Error("Microphone permission or access error: " + (e?.message || e));
    }
  }

  private startNewRecordingSession() {
      if (!this.stream || !this.isListening) return;

      this.audioChunks = [];
      this.hasDetectedSpeech = false;

      try {
          this.mediaRecorder = new MediaRecorder(this.stream, this.activeMimeType ? { mimeType: this.activeMimeType } : undefined);
          this.mediaRecorder.ondataavailable = (e) => {
              if (e.data && e.data.size > 0) {
                  this.audioChunks.push(e.data);
              }
          };
          this.mediaRecorder.start(200);

          if (this.maxDurationTimer) clearTimeout(this.maxDurationTimer);
          this.maxDurationTimer = setTimeout(() => {
              if (this.hasDetectedSpeech) {
                  this.finalizeUtterance();
              } else {
                  this.startNewRecordingSession();
              }
          }, this.MAX_DURATION);
      } catch (err) {
          console.error('[AudioRecorder] Failed to start MediaRecorder:', err);
      }
  }

  private finalizeUtterance() {
      if (this.maxDurationTimer) clearTimeout(this.maxDurationTimer);
      if (!this.mediaRecorder || this.mediaRecorder.state === 'inactive') return;

      const currentRecorder = this.mediaRecorder;
      currentRecorder.onstop = () => {
          if (this.audioChunks.length > 0 && this.onUtteranceCb) {
              const mime = this.activeMimeType || currentRecorder.mimeType || 'audio/webm';
              const blob = new Blob(this.audioChunks, { type: mime });
              useAppStore.getState().updateDiagnostics({ blobSize: blob.size });
              this.onUtteranceCb(blob);
          }
          this.audioChunks = [];
          // If still listening, immediately begin the next recording window
          if (this.isListening) {
              this.startNewRecordingSession();
          }
      };

      try {
          currentRecorder.stop();
      } catch (err) {
          console.error('[AudioRecorder] Error stopping MediaRecorder:', err);
      }
  }

  async stop(): Promise<void> {
    this.isListening = false;
    if (this.maxDurationTimer) clearTimeout(this.maxDurationTimer);
    if (this.vad) {
        this.vad.stop();
        this.vad = null;
    }
    if (this.stream) {
        this.stream.getTracks().forEach(t => t.stop());
        this.stream = null;
    }
    // If speech was recorded before clicking Stop, finalize it so user speech isn't lost
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        const rec = this.mediaRecorder;
        rec.onstop = () => {
            if (this.audioChunks.length > 0 && this.onUtteranceCb && this.hasDetectedSpeech) {
                const mime = this.activeMimeType || rec.mimeType || 'audio/webm';
                const blob = new Blob(this.audioChunks, { type: mime });
                useAppStore.getState().updateDiagnostics({ blobSize: blob.size });
                this.onUtteranceCb(blob);
            }
            this.audioChunks = [];
        };
        try { rec.stop(); } catch (_) {}
    }
    this.mediaRecorder = null;
    useAppStore.getState().updateDiagnostics({ micActive: false, speechDetected: false });
  }
}
