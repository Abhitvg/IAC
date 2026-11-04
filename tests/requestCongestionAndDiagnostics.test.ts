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
});
