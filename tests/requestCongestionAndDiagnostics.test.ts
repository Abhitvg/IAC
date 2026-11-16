import { describe, it, expect, beforeEach } from 'vitest';
import { DiagnosticLoggerService } from '../src/services/diagnosticLogger';
import { useAppStore } from '../src/store/useAppStore';
import { InterviewEngine } from '../src/services/InterviewEngine';

describe('Suite D: Request Congestion, Concurrency & Diagnostics (Phases 5 & 7)', () => {
  beforeEach(() => {
    DiagnosticLoggerService.getInstance().clear();
    useAppStore.setState({
      status: 'listening',
      currentQuestion: null,
      currentAnswer: null,
      activeRequestId: null,
    });
  });

  it('records pipeline diagnostic events across transitions with strict redaction of API keys', () => {
    const logger = DiagnosticLoggerService.getInstance();
    const requestId = 'req_test_101';
    const fakeSecret = 'gsk_supersecretkey12345678901234567890';

    logger.recordEvent({
      requestId,
      pipelineStage: 'generating',
      selectedProvider: 'groq',
      selectedModel: 'openai/gpt-oss-120b',
      message: `Request initiated with key: ${fakeSecret}`,
    });

    const events = logger.getEventsForRequest(requestId);
    expect(events.length).toBe(1);
    expect(events[0].message).not.toContain(fakeSecret);
    expect(events[0].message).toContain('[REDACTED_GROQ_KEY]');
  });

  it('exports diagnostic logs as clean JSON and formatted text without secrets', () => {
    const logger = DiagnosticLoggerService.getInstance();
    logger.recordEvent({
      requestId: 'req_diag_1',
      pipelineStage: 'transcript_received',
      message: 'Heard question from interviewer',
    });
    logger.recordEvent({
      requestId: 'req_diag_1',
      pipelineStage: 'answer_ready',
      finalOutcome: 'SUCCESS',
      message: 'Bearer gsk_123456789012345678901234567890',
    });

    const jsonLogs = logger.exportLogsAsJson();
    const textLogs = logger.exportLogsAsText();

    expect(jsonLogs).toContain('req_diag_1');
    expect(jsonLogs).not.toContain('gsk_1234567890');

    expect(textLogs).toContain('STAGE: transcript_received');
    expect(textLogs).toContain('OUTCOME: SUCCESS');
    expect(textLogs).not.toContain('gsk_1234567890');
  });

  it('deduplicates in-flight identical question submissions', async () => {
    const question = 'What is the CAP theorem?';

    // Set store to analyzing
    useAppStore.setState({
      status: 'analyzing',
      currentQuestion: question,
      generationId: 1,
    });

    const initialGen = useAppStore.getState().generationId;

    // Trigger duplicate event
    await InterviewEngine.handleEvent({
      type: 'QUESTION_DETECTED',
      text: question,
    });

    // Generation ID must not increment because duplicate was ignored
    expect(useAppStore.getState().generationId).toBe(initialGen);
  });
  it('aggregates terminal outcomes by provider/model and keeps unresolved requests separate', () => {
    const logger = DiagnosticLoggerService.getInstance();
    logger.recordEvent({
      requestId: 'req_success',
      pipelineStage: 'generating',
      selectedProvider: 'groq',
      selectedModel: 'llama-3.3-70b',
    });
    logger.recordEvent({
      requestId: 'req_success',
      pipelineStage: 'answer_ready',
      finalOutcome: 'SUCCESS',
    });
    logger.recordEvent({
      requestId: 'req_failed',
      pipelineStage: 'generating',
      selectedProvider: 'openai',
      selectedModel: 'gpt-4.1',
    });
    logger.recordEvent({
      requestId: 'req_failed',
      pipelineStage: 'failed',
      finalOutcome: 'FAILED',
    });
    logger.recordEvent({
      requestId: 'req_pending',
      pipelineStage: 'streaming',
      selectedProvider: 'groq',
      selectedModel: 'llama-3.3-70b',
    });
    logger.recordEvent({
      requestId: 'req_stt',
      pipelineStage: 'transcript_received',
      transcriptionOutcome: 'EMPTY',
      audioCaptureOutcome: 'FAILED',
      sessionSaveOutcome: 'SUCCESS',
    });

    const summary = logger.getReliabilitySummary();
    expect(summary.requestCount).toBe(4);
    expect(summary.terminalRequestCount).toBe(2);
    expect(summary.unresolvedRequestCount).toBe(2);
    expect(summary.succeeded).toBe(1);
    expect(summary.failed).toBe(1);
    expect(summary.successRate).toBe(0.5);
    expect(summary.transcription.empty).toBe(1);
    expect(summary.audioCapture.failed).toBe(1);
    expect(summary.sessionSave.success).toBe(1);
    expect(summary.byProviderModel).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          provider: 'groq',
          model: 'llama-3.3-70b',
          requests: 2,
          succeeded: 1,
          unresolved: 1,
          successRate: 1,
        }),
        expect.objectContaining({
          provider: 'openai',
          model: 'gpt-4.1',
          requests: 1,
          failed: 1,
          successRate: 0,
        }),
      ])
    );
    expect(logger.exportReliabilitySummaryAsJson()).toContain('"unresolvedRequestCount": 2');
  });
});
