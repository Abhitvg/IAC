import { sanitizeDiagnosticSecret } from './models/modelRegistry';

export interface PipelineDiagnosticEvent {
  requestId: string;
  timestamp: number;
  pipelineStage:
    | 'listening'
    | 'transcribing'
    | 'transcript_received'
    | 'identifying_question'
    | 'generating'
    | 'streaming'
    | 'validating'
    | 'answer_ready'
    | 'ready'
    | 'waiting_quota_reset'
    | 'retrying'
    | 'failed'
    | 'confirmation_required';
  transcriptClassification?: {
    type: string;
    confidence: number;
    reason: string;
  };
  selectedProvider?: string;
  selectedModel?: string;
  httpStatus?: number;
  providerErrorCode?: string;
  retryAttempt?: number;
  retryDelayMs?: number;
  timeToFirstTokenMs?: number;
  totalGenerationTimeMs?: number;
  transcriptionDurationMs?: number;
  transcriptCharacterCount?: number;
  audioByteLength?: number;
  transcriptionOutcome?: 'SUCCESS' | 'EMPTY' | 'FAILED' | 'ABORTED';
  audioCaptureDurationMs?: number;
  audioCaptureOutcome?: 'STARTING' | 'ACTIVE' | 'STOPPED' | 'FAILED' | 'ABORTED';
  sessionSaveDurationMs?: number;
  sessionQuestionCount?: number;
  sessionSaveOutcome?: 'SUCCESS' | 'FAILED';
  receivedTokenCount?: number;
  isEmptyResponse?: boolean;
  finalOutcome?:
    | 'SUCCESS'
    | 'RATE_LIMITED'
    | 'FAILED'
    | 'BLOCKED'
    | 'ABORTED'
    | 'CONFIRMATION_NEEDED'
    | 'UNCLASSIFIED';
  message?: string;
}

export interface ReliabilityGroupSummary {
  provider: string;
  model: string;
  requests: number;
  succeeded: number;
  failed: number;
  blocked: number;
  aborted: number;
  rateLimited: number;
  unresolved: number;
  successRate: number | null;
}

export interface ReliabilitySummary {
  eventCount: number;
  requestCount: number;
  terminalRequestCount: number;
  unresolvedRequestCount: number;
  succeeded: number;
  failed: number;
  blocked: number;
  aborted: number;
  rateLimited: number;
  successRate: number | null;
  transcription: { success: number; empty: number; failed: number; aborted: number };
  audioCapture: { started: number; stopped: number; failed: number; aborted: number };
  sessionSave: { success: number; failed: number };
  byProviderModel: ReliabilityGroupSummary[];
}

export class DiagnosticLoggerService {
  private static instance: DiagnosticLoggerService | null = null;
  private events: PipelineDiagnosticEvent[] = [];
  private readonly maxEvents: number = 200;

  public static getInstance(): DiagnosticLoggerService {
    if (!DiagnosticLoggerService.instance) {
      DiagnosticLoggerService.instance = new DiagnosticLoggerService();
    }
    return DiagnosticLoggerService.instance;
  }

  public recordEvent(
    event: Omit<PipelineDiagnosticEvent, 'timestamp'> & { timestamp?: number }
  ): void {
    const sanitizedMsg = event.message ? sanitizeDiagnosticSecret(event.message) : undefined;
    const sanitizedReason = event.transcriptClassification?.reason
      ? sanitizeDiagnosticSecret(event.transcriptClassification.reason)
      : undefined;

    const fullEvent: PipelineDiagnosticEvent = {
      ...event,
      timestamp: event.timestamp || Date.now(),
      message: sanitizedMsg,
      transcriptClassification: event.transcriptClassification
        ? {
            ...event.transcriptClassification,
            reason: sanitizedReason || event.transcriptClassification.reason,
          }
        : undefined,
    };

    this.events.push(fullEvent);
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }
  }

  public getEvents(): readonly PipelineDiagnosticEvent[] {
    return [...this.events];
  }

  public getEventsForRequest(requestId: string): PipelineDiagnosticEvent[] {
    return this.events.filter((e) => e.requestId === requestId);
  }

  /**
   * Summarizes only the currently retained diagnostic window. A request is
   * counted once, using its latest terminal outcome; requests without one are
   * explicitly unresolved rather than silently counted as failures/successes.
   */
  public getReliabilitySummary(): ReliabilitySummary {
    const latestByRequest = new Map<string, PipelineDiagnosticEvent>();
    const groups = new Map<string, ReliabilityGroupSummary>();
    const summary: ReliabilitySummary = {
      eventCount: this.events.length,
      requestCount: 0,
      terminalRequestCount: 0,
      unresolvedRequestCount: 0,
      succeeded: 0,
      failed: 0,
      blocked: 0,
      aborted: 0,
      rateLimited: 0,
      successRate: null,
      transcription: { success: 0, empty: 0, failed: 0, aborted: 0 },
      audioCapture: { started: 0, stopped: 0, failed: 0, aborted: 0 },
      sessionSave: { success: 0, failed: 0 },
      byProviderModel: [],
    };

    for (const event of this.events) {
      const previous = latestByRequest.get(event.requestId);
      if (!previous || event.timestamp >= previous.timestamp) {
        latestByRequest.set(event.requestId, event);
      }
      if (event.transcriptionOutcome) {
        summary.transcription[
          event.transcriptionOutcome === 'SUCCESS' ? 'success' :
          event.transcriptionOutcome === 'EMPTY' ? 'empty' :
          event.transcriptionOutcome === 'FAILED' ? 'failed' : 'aborted'
        ] += 1;
      }
      if (event.audioCaptureOutcome === 'STARTING') summary.audioCapture.started += 1;
      if (event.audioCaptureOutcome === 'STOPPED') summary.audioCapture.stopped += 1;
      if (event.audioCaptureOutcome === 'FAILED') summary.audioCapture.failed += 1;
      if (event.audioCaptureOutcome === 'ABORTED') summary.audioCapture.aborted += 1;
      if (event.sessionSaveOutcome === 'SUCCESS') summary.sessionSave.success += 1;
      if (event.sessionSaveOutcome === 'FAILED') summary.sessionSave.failed += 1;
    }

    for (const event of latestByRequest.values()) {
      summary.requestCount += 1;
      const outcome = event.finalOutcome;
      if (!outcome || outcome === 'UNCLASSIFIED' || outcome === 'CONFIRMATION_NEEDED') {
        summary.unresolvedRequestCount += 1;
        continue;
      }
      summary.terminalRequestCount += 1;
      if (outcome === 'SUCCESS') summary.succeeded += 1;
      else if (outcome === 'FAILED') summary.failed += 1;
      else if (outcome === 'BLOCKED') summary.blocked += 1;
      else if (outcome === 'ABORTED') summary.aborted += 1;
      else if (outcome === 'RATE_LIMITED') summary.rateLimited += 1;

      const provider = event.selectedProvider || 'unknown';
      const model = event.selectedModel || 'unknown';
      const key = `${provider}/${model}`;
      const group = groups.get(key) || {
        provider, model, requests: 0, succeeded: 0, failed: 0, blocked: 0,
        aborted: 0, rateLimited: 0, unresolved: 0, successRate: null,
      };
      group.requests += 1;
      if (outcome === 'SUCCESS') group.succeeded += 1;
      else if (outcome === 'FAILED') group.failed += 1;
      else if (outcome === 'BLOCKED') group.blocked += 1;
      else if (outcome === 'ABORTED') group.aborted += 1;
      else if (outcome === 'RATE_LIMITED') group.rateLimited += 1;
      groups.set(key, group);
    }

    const terminal = summary.terminalRequestCount;
    summary.successRate = terminal > 0 ? summary.succeeded / terminal : null;
    summary.byProviderModel = [...groups.values()].map((group) => ({
      ...group,
      successRate: group.requests > 0 ? group.succeeded / group.requests : null,
    })).sort((a, b) => b.requests - a.requests);
    return summary;
  }

  public exportReliabilitySummaryAsJson(): string {
    return JSON.stringify(this.getReliabilitySummary(), null, 2);
  }

  public clear(): void {
    this.events = [];
  }

  public exportLogsAsJson(): string {
    return JSON.stringify(this.events, null, 2);
  }

  public exportLogsAsText(): string {
    return this.events
      .map((e) => {
        const time = new Date(e.timestamp).toISOString();
        const details = [
          `[${time}]`,
          `[${e.requestId}]`,
          `STAGE: ${e.pipelineStage}`,
          e.selectedProvider ? `PROVIDER: ${e.selectedProvider}/${e.selectedModel}` : '',
          e.httpStatus ? `HTTP: ${e.httpStatus}` : '',
          e.providerErrorCode ? `CODE: ${e.providerErrorCode}` : '',
          e.retryAttempt !== undefined ? `RETRY: ${e.retryAttempt}` : '',
          e.timeToFirstTokenMs ? `TTFT: ${e.timeToFirstTokenMs}ms` : '',
          e.totalGenerationTimeMs ? `TOTAL: ${e.totalGenerationTimeMs}ms` : '',
          e.transcriptionDurationMs !== undefined ? `STT: ${e.transcriptionDurationMs}ms` : '',
          e.transcriptCharacterCount !== undefined
            ? `TRANSCRIPT_CHARS: ${e.transcriptCharacterCount}`
            : '',
          e.audioByteLength !== undefined ? `AUDIO_BYTES: ${e.audioByteLength}` : '',
          e.transcriptionOutcome ? `STT_OUTCOME: ${e.transcriptionOutcome}` : '',
          e.audioCaptureDurationMs !== undefined ? `CAPTURE: ${e.audioCaptureDurationMs}ms` : '',
          e.audioCaptureOutcome ? `CAPTURE_OUTCOME: ${e.audioCaptureOutcome}` : '',
          e.sessionSaveDurationMs !== undefined ? `SESSION_SAVE: ${e.sessionSaveDurationMs}ms` : '',
          e.sessionQuestionCount !== undefined
            ? `SESSION_QUESTIONS: ${e.sessionQuestionCount}`
            : '',
          e.sessionSaveOutcome ? `SESSION_SAVE_OUTCOME: ${e.sessionSaveOutcome}` : '',
          e.receivedTokenCount !== undefined ? `TOKENS: ${e.receivedTokenCount}` : '',
          e.finalOutcome ? `OUTCOME: ${e.finalOutcome}` : '',
          e.message ? `MSG: ${e.message}` : '',
        ]
          .filter(Boolean)
          .join(' | ');
        return details;
      })
      .join('\n');
  }
}
