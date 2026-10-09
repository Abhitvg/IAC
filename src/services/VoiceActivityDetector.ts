import { useAppStore } from '../store/useAppStore';
export class VoiceActivityDetector {
    private audioContext: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private animationId: number | null = null;
    
    private voiceThreshold = -35; // More forgiving // dB
    private silenceThreshold = -40; // More forgiving // dB
    
    private speechStartDelay = 200; // ms
    private speechEndDelay = 1200; // ms
    
    private isSpeaking = false;
    private lastSpeechTime = 0;
    private firstSpeechTime = 0;

    private onStartCb: (() => void) | null = null;
    private onEndCb: (() => void) | null = null;

    start(stream: MediaStream) {
        this.audioContext = new AudioContext();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 512;
        this.analyser.smoothingTimeConstant = 0.4;
        
        this.source = this.audioContext.createMediaStreamSource(stream);
        this.source.connect(this.analyser);
        
        this.isSpeaking = false;
        this.lastSpeechTime = 0;
        this.firstSpeechTime = 0;
        
        this.monitor();
    }
    
    onSpeechStart(cb: () => void) { this.onStartCb = cb; return () => this.onStartCb = null; }
    onSpeechEnd(cb: () => void) { this.onEndCb = cb; return () => this.onEndCb = null; }

    private monitor = () => {
        if (!this.analyser) return;
        
        const dataArray = new Float32Array(this.analyser.fftSize);
        this.analyser.getFloatTimeDomainData(dataArray);
        
        let sumSquares = 0;
        for (let i = 0; i < dataArray.length; i++) {
            sumSquares += dataArray[i] * dataArray[i];
        }
        const rms = Math.sqrt(sumSquares / dataArray.length);
        const db = 20 * Math.log10(rms || 0.0001);
        if (Math.random() < 0.1) useAppStore.getState().updateDiagnostics({ currentDb: Math.round(db) });
        
        const now = Date.now();
        
        if (db > this.voiceThreshold) {
            this.lastSpeechTime = now;
            if (!this.isSpeaking) {
                if (this.firstSpeechTime === 0) this.firstSpeechTime = now;
                if (now - this.firstSpeechTime > this.speechStartDelay) {
                    this.isSpeaking = true;
                    this.onStartCb?.();
                }
            }
        } else if (db < this.silenceThreshold) {
            this.firstSpeechTime = 0;
            if (this.isSpeaking && (now - this.lastSpeechTime > this.speechEndDelay)) {
                this.isSpeaking = false;
                this.onEndCb?.();
            }
        }
        
        this.animationId = requestAnimationFrame(this.monitor);
    }
    
    stop() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        if (this.source) this.source.disconnect();
        if (this.audioContext) this.audioContext.close();
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.isSpeaking = false;
    }
}