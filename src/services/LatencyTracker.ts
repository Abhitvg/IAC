export class LatencyTracker {
    public metrics: Record<string, number> = {};
    private timestamps: Record<string, number> = {};
    
    mark(event: 'speechStart' | 'speechEnd' | 'transcriptionStart' | 'transcriptionEnd' | 'questionDetected' | 'generationStart' | 'firstToken' | 'firstSentence' | 'generationEnd' | 'generationAborted' | 'generationError') {
        this.timestamps[event] = performance.now();
        this.calculate();
    }
    
    private calculate() {
        if (this.timestamps.transcriptionEnd && this.timestamps.transcriptionStart) {
            this.metrics.whisperLatency = this.timestamps.transcriptionEnd - this.timestamps.transcriptionStart;
        }
        if (this.timestamps.questionDetected && this.timestamps.transcriptionEnd) {
            this.metrics.questionDetectionLatency = this.timestamps.questionDetected - this.timestamps.transcriptionEnd;
        }
        if (this.timestamps.firstToken && this.timestamps.generationStart) {
            this.metrics.aiTTFT = this.timestamps.firstToken - this.timestamps.generationStart;
        }
        if (this.timestamps.firstSentence && this.timestamps.questionDetected) {
            this.metrics.firstSentenceLatency = this.timestamps.firstSentence - this.timestamps.questionDetected;
        }
        if (this.timestamps.generationEnd && this.timestamps.generationStart) {
            this.metrics.totalGenerationLatency = this.timestamps.generationEnd - this.timestamps.generationStart;
        }
    }
    
    getReport() {
        return {
            whisperLatencyMs: this.metrics.whisperLatency,
            aiTTFTMs: this.metrics.aiTTFT,
            firstSentenceLatencyMs: this.metrics.firstSentenceLatency,
            totalGenerationLatencyMs: this.metrics.totalGenerationLatency
        };
    }
}
export const globalLatencyTracker = new LatencyTracker();