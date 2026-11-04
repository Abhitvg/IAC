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
  receivedTokenCount?: number;
  isEmptyResponse?: boolean;
  finalOutcome?: 'SUCCESS' | 'RATE_LIMITED' | 'FAILED' | 'BLOCKED' | 'ABORTED' | 'CONFIRMATION_NEEDED';
  message?: string;
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

  public recordEvent(event: Omit<PipelineDiagnosticEvent, 'timestamp'> & { timestamp?: number }): void {
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
