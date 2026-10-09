import { useAppStore } from '../store/useAppStore';
import { VoiceActivityDetector } from './VoiceActivityDetector';

export class AudioRecorder {
  private mediaRecorder: MediaRecorder | null = null;
  private audioChunks: Blob[] = [];
  private stream: MediaStream | null = null;
  private vad: VoiceActivityDetector | null = null;
  private onUtteranceCb: ((blob: Blob) => void) | null = null;
  
  private maxDurationTimer: any = null;
  private MAX_DURATION = 45000;

  async start(onUtterance: (blob: Blob) => void): Promise<void> {
    this.onUtteranceCb = onUtterance;
    try {
      this.stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, sampleRate: 16000 } });
      useAppStore.getState().updateDiagnostics({ micActive: true });
      
      const types = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/ogg'];
      let mimeType = '';
      for (const t of types) {
          if (MediaRecorder.isTypeSupported(t)) {
              mimeType = t;
              break;
          }
      }
      if (!mimeType) throw new Error("No supported audio MIME type found in this browser.");
      useAppStore.getState().updateDiagnostics({ mimeType });
      (this as any).activeMimeType = mimeType;

      
      this.vad = new VoiceActivityDetector();
      this.vad.start(this.stream);
      
      this.vad.onSpeechStart(() => {
          useAppStore.getState().updateDiagnostics({ speechDetected: true });
          if (!this.stream) return;
          this.audioChunks = [];
          this.mediaRecorder = new MediaRecorder(this.stream, { mimeType });
          this.mediaRecorder.ondataavailable = e => { if (e.data.size > 0) this.audioChunks.push(e.data); };
          this.mediaRecorder.start(250);
          
          this.maxDurationTimer = setTimeout(() => this.finalizeUtterance(), this.MAX_DURATION);
      });
      
      this.vad.onSpeechEnd(() => {
          useAppStore.getState().updateDiagnostics({ speechDetected: false });
          this.finalizeUtterance();
      });
      
    } catch (e) {
      throw new Error("Microphone permission required.");
    }
  }

  private finalizeUtterance() {
      if (this.maxDurationTimer) clearTimeout(this.maxDurationTimer);
      if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
          this.mediaRecorder.onstop = () => {
              if (this.audioChunks.length > 0 && this.onUtteranceCb) {
                  const blob = new Blob(this.audioChunks, { type: (this as any).activeMimeType });
                  useAppStore.getState().updateDiagnostics({ blobSize: blob.size });
                  this.onUtteranceCb(blob);
              }
              this.audioChunks = [];
          };
          this.mediaRecorder.stop();
      }
  }

  async stop(): Promise<void> {
    if (this.maxDurationTimer) clearTimeout(this.maxDurationTimer);
    if (this.vad) this.vad.stop();
    if (this.stream) this.stream.getTracks().forEach(t => t.stop());
    if (this.mediaRecorder && this.mediaRecorder.state !== 'inactive') {
        this.mediaRecorder.stop();
    }
    this.mediaRecorder = null;
    useAppStore.getState().updateDiagnostics({ micActive: false, speechDetected: false });
    this.stream = null;
    this.audioChunks = [];
  }
}