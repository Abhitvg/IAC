/**
 * Request-scoped Latency Tracker
 * Accurately measures latency milestones across the speech-to-answer pipeline
 * without global state corruption between concurrent or sequential requests.
 */

export type LatencyEvent =
  | 'speechStart'
  | 'speechEnd'
  | 'transcriptionStart'
  | 'transcriptionEnd'
  | 'questionDetected'
  | 'generationStart'
  | 'firstToken'
  | 'firstSentence'
  | 'generationEnd'
  | 'generationAborted'
  | 'generationError';

export interface LatencyReport {
  requestId: string;
  whisperLatencyMs?: number;
  questionDetectionLatencyMs?: number;
  aiTTFTMs?: number;
  firstSentenceLatencyMs?: number;
  totalGenerationLatencyMs?: number;
  totalEndToEndMs?: number;
  isCancelled?: boolean;
  isError?: boolean;
  // Aliases for compatibility
  timeToFirstSentence?: number;
  generationDuration?: number;
  totalPipelineLatency?: number;
}

export class LatencyTracker {
  public readonly requestId: string;
  public metrics: Record<string, number> = {};
  private timestamps: Partial<Record<LatencyEvent, number>> = {};
  private _firstTokenRecorded = false;
  private _firstSentenceRecorded = false;

  constructor(requestId: string = `req_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`) {
    this.requestId = requestId;
  }

  public mark(event: LatencyEvent): void {
    const now = performance.now();
    this.timestamps[event] = now;

    if (event === 'firstToken') {
      this._firstTokenRecorded = true;
    } else if (event === 'firstSentence') {
      this._firstSentenceRecorded = true;
    }

    this.calculate();
  }

  public markFirstTokenOnce(): boolean {
    if (this._firstTokenRecorded) return false;
    this.mark('firstToken');
    return true;
  }

  public markFirstSentenceOnce(): boolean {
    if (this._firstSentenceRecorded) return false;
    this.mark('firstSentence');
    return true;
  }

  public isFirstTokenRecorded(): boolean {
    return this._firstTokenRecorded;
  }

  public isFirstSentenceRecorded(): boolean {
    return this._firstSentenceRecorded;
  }

  private calculate(): void {
    if (this.timestamps.transcriptionEnd && this.timestamps.transcriptionStart) {
      this.metrics.whisperLatency =
        this.timestamps.transcriptionEnd - this.timestamps.transcriptionStart;
    }
    if (this.timestamps.questionDetected && this.timestamps.transcriptionEnd) {
      this.metrics.questionDetectionLatency =
        this.timestamps.questionDetected - this.timestamps.transcriptionEnd;
    }
    if (this.timestamps.firstToken && this.timestamps.generationStart) {
      this.metrics.aiTTFT = this.timestamps.firstToken - this.timestamps.generationStart;
    }
    if (this.timestamps.firstSentence && this.timestamps.questionDetected) {
      this.metrics.firstSentenceLatency =
        this.timestamps.firstSentence - this.timestamps.questionDetected;
    }
    if (this.timestamps.generationEnd && this.timestamps.generationStart) {
      this.metrics.totalGenerationLatency =
        this.timestamps.generationEnd - this.timestamps.generationStart;
    }
    if (this.timestamps.generationEnd && this.timestamps.speechStart) {
      this.metrics.totalEndToEnd =
        this.timestamps.generationEnd - this.timestamps.speechStart;
    }
  }

  public getReport(): LatencyReport {
    return {
      requestId: this.requestId,
      whisperLatencyMs: this.metrics.whisperLatency,
      questionDetectionLatencyMs: this.metrics.questionDetectionLatency,
      aiTTFTMs: this.metrics.aiTTFT,
      firstSentenceLatencyMs: this.metrics.firstSentenceLatency,
      totalGenerationLatencyMs: this.metrics.totalGenerationLatency,
      totalEndToEndMs: this.metrics.totalEndToEnd,
      isCancelled: Boolean(this.timestamps.generationAborted),
      isError: Boolean(this.timestamps.generationError),
      timeToFirstSentence: this.metrics.firstSentenceLatency,
      generationDuration: this.metrics.totalGenerationLatency,
      totalPipelineLatency: this.metrics.totalEndToEnd ?? this.metrics.totalGenerationLatency,
    };
  }

  public reset(): void {
    this.metrics = {};
    this.timestamps = {};
    this._firstTokenRecorded = false;
    this._firstSentenceRecorded = false;
  }
}

/** Backward-compatible singleton delegating to active request or standalone tracker */
class GlobalLatencyTrackerProxy {
  private activeTracker: LatencyTracker = new LatencyTracker('global');

  public setActiveTracker(tracker: LatencyTracker) {
    this.activeTracker = tracker;
  }

  public get current(): LatencyTracker {
    return this.activeTracker;
  }

  public mark(event: LatencyEvent): void {
    this.activeTracker.mark(event);
  }

  public markFirstTokenOnce(): boolean {
    return this.activeTracker.markFirstTokenOnce();
  }

  public markFirstSentenceOnce(): boolean {
    return this.activeTracker.markFirstSentenceOnce();
  }

  public getReport(): LatencyReport {
    return this.activeTracker.getReport();
  }

  public reset(): void {
    this.activeTracker.reset();
  }
}

export const globalLatencyTracker = new GlobalLatencyTrackerProxy();
