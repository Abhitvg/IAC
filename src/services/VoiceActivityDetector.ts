import { useAppStore } from '../store/useAppStore';

export class VoiceActivityDetector {
    private audioContext: AudioContext | null = null;
    private analyser: AnalyserNode | null = null;
    private source: MediaStreamAudioSourceNode | null = null;
    private animationId: number | null = null;
    
    // Normal conversational voice at arm's length is -48 dB to -38 dB.
    // Room background is -60 dB to -55 dB.
    private voiceThreshold = -48; // dB
    private silenceThreshold = -55; // dB
    
    private speechStartDelay = 60; // ms (responsive start to prevent clipping initial syllable)
    private speechEndDelay = 900; // ms of silence before utterance finishes
    
    private isSpeaking = false;
    private lastSpeechTime = 0;
    private firstSpeechTime = 0;
    private lastDbUpdate = 0;

    private onStartCb: (() => void) | null = null;
    private onEndCb: (() => void) | null = null;

    start(stream: MediaStream) {
        const AudioContextCtor = window.AudioContext || (window as any).webkitAudioContext;
        this.audioContext = new AudioContextCtor();
        this.analyser = this.audioContext.createAnalyser();
        this.analyser.fftSize = 512;
        this.analyser.smoothingTimeConstant = 0.3;
        
        this.source = this.audioContext.createMediaStreamSource(stream);
        this.source.connect(this.analyser);
        
        this.isSpeaking = false;
        this.lastSpeechTime = 0;
        this.firstSpeechTime = 0;
        this.lastDbUpdate = 0;
        
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
        const db = 20 * Math.log10(rms || 0.00001);
        
        const now = Date.now();
        // Update volume level in UI every 100ms for smooth live feedback
        if (now - this.lastDbUpdate > 100) {
            this.lastDbUpdate = now;
            useAppStore.getState().updateDiagnostics({ currentDb: Math.round(db) });
        }
        
        if (db > this.voiceThreshold) {
            this.lastSpeechTime = now;
            if (!this.isSpeaking) {
                if (this.firstSpeechTime === 0) this.firstSpeechTime = now;
                if (now - this.firstSpeechTime >= this.speechStartDelay) {
                    this.isSpeaking = true;
                    this.onStartCb?.();
                }
            }
        } else if (db < this.silenceThreshold) {
            this.firstSpeechTime = 0;
            if (this.isSpeaking && (now - this.lastSpeechTime >= this.speechEndDelay)) {
                this.isSpeaking = false;
                this.onEndCb?.();
            }
        }
        
        this.animationId = requestAnimationFrame(this.monitor);
    }
    
    stop() {
        if (this.animationId) cancelAnimationFrame(this.animationId);
        if (this.source) {
            try { this.source.disconnect(); } catch (_) {}
        }
        if (this.audioContext && this.audioContext.state !== 'closed') {
            this.audioContext.close().catch(() => undefined);
        }
        this.audioContext = null;
        this.analyser = null;
        this.source = null;
        this.isSpeaking = false;
    }
}
