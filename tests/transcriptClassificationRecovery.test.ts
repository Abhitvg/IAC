import { describe, it, expect, beforeEach, vi } from 'vitest';
import { transcribeAudio } from '../src/services/whisper';
import { classifyUtterance } from '../src/services/interruptionDetector';
import { useAppStore } from '../src/store/useAppStore';
import { InterviewEngine } from '../src/services/InterviewEngine';
import { AudioRecorder } from '../src/services/audio';
import { shouldAutoRouteUncertainQuestion } from '../src/services/interviewQuestionRouting';

vi.mock('../src/services/whisper', () => ({
  transcribeAudio: vi.fn(),
}));

describe('Suite A: Transcript Classification & Recovery', () => {
  const previousAnswer =
    'In microservices architectures, distributed tracing with OpenTelemetry and Jaeger helps identify latency bottlenecks across remote procedure calls.';

  beforeEach(() => {
    useAppStore.setState({
      status: 'listening',
      currentQuestion: 'How do you monitor distributed systems?',
      currentAnswer: previousAnswer,
      teleprompterQueue: [
        'In microservices architectures, distributed tracing with OpenTelemetry and Jaeger helps identify latency bottlenecks across remote procedure calls.',
      ],
      lastUnconfirmedTranscript: null,
      recoveredPartialAnswer: null,
      transcript: [],
    });
  });

  it('recognizes question-shaped speech even when speaker identity is unavailable', () => {
    const speech = 'What trade-offs do you consider when choosing Kafka over RabbitMQ?';
    const result = classifyUtterance(speech, previousAnswer, [previousAnswer]);

    expect(result.type).toBe('UNCLASSIFIED');
    expect(result.needsConfirmation).toBe(true);
    expect(result.confidence).toBeLessThan(0.7);
  });

  it('recognizes follow-up questions containing answer words', () => {
    // Has overlap on "distributed", "tracing", "OpenTelemetry"
    const followUp =
      'Can you explain how OpenTelemetry sampling affects distributed tracing overhead?';
    const result = classifyUtterance(followUp, previousAnswer, [previousAnswer]);

    expect(result.type).toBe('UNCLASSIFIED');
    expect(result.needsConfirmation).toBe(true);
  });

  it('recognizes multi-sentence question-shaped speech', () => {
    const speech =
      'So looking at your architecture, how does your service handle database failover under high load?';
    const result = classifyUtterance(speech, previousAnswer, [previousAnswer]);

    expect(result.type).toBe('UNCLASSIFIED');
    expect(result.needsConfirmation).toBe(true);
    expect(result.questionText).toContain('database failover');
  });

  it('recognizes incomplete question-shaped speech', () => {
    const incompleteSpeech = 'When scaling your database horizontally, what happens if...';
    const result = classifyUtterance(incompleteSpeech, previousAnswer, [previousAnswer]);

    expect(result.type).toBe('UNCLASSIFIED');
    expect(result.needsConfirmation).toBe(true);
    expect(result.isIncomplete).toBe(true);
  });

  it('recognizes Hindi and Hinglish question intent without blocking generation', () => {
    const hindi = classifyUtterance(
      'क्या आप बता सकते हैं कि database failover कैसे काम करता है?',
      null,
      []
    );
    const hinglish = classifyUtterance(
      'is system mein cache invalidation kaise handle karte ho?',
      null,
      []
    );
    expect(hindi.type).toBe('UNCLASSIFIED');
    expect(hindi.needsConfirmation).toBe(true);
    expect(hinglish.type).toBe('UNCLASSIFIED');
    expect(hinglish.needsConfirmation).toBe(true);
  });

  it('classifies candidate speaking/repeating their teleprompted answer as CANDIDATE_RECITAL', () => {
    const candidateSpeech =
      'distributed tracing with OpenTelemetry and Jaeger helps identify latency bottlenecks';
    const result = classifyUtterance(candidateSpeech, previousAnswer, [previousAnswer]);

    expect(result.type).toBe('CANDIDATE_RECITAL');
    expect(result.confidence).toBeGreaterThanOrEqual(0.7);
  });

  it('classifies conversational courtesies ("Thank you.") as CONVERSATIONAL_FILLER and does not trigger generation', () => {
    const filler1 = 'Thank you.';
    const result1 = classifyUtterance(filler1, previousAnswer, [previousAnswer]);
    expect(result1.type).toBe('CONVERSATIONAL_FILLER');

    const filler2 = 'Great thank you';
    const result2 = classifyUtterance(filler2, previousAnswer, [previousAnswer]);
    expect(result2.type).toBe('CONVERSATIONAL_FILLER');

    const filler3 = 'Tvr.';
    const result3 = classifyUtterance(filler3, null, []);
    expect(result3.type).toBe('CONVERSATIONAL_FILLER');
  });

  it('routes question-shaped speech automatically without storing a confirmation request', () => {
    const speech = 'What about distributed tracing telemetry overhead metrics?';
    const result = classifyUtterance(speech, previousAnswer, [previousAnswer]);

    expect(result.type).toBe('UNCLASSIFIED');
    expect(result.needsConfirmation).toBe(true);
    expect(shouldAutoRouteUncertainQuestion(result, speech)).toBe(true);
    expect(useAppStore.getState().lastUnconfirmedTranscript).toBeNull();
    expect(useAppStore.getState().pipelineStage).toBe('listening');
  });

  it('keeps raw utterance and duplicate-question text out of renderer console logs', async () => {
    const transcriptText = 'Thank you.';
    const duplicateQuestion = 'Private interview prompt 41A7 must never appear in logs.';

    vi.mocked(transcribeAudio).mockResolvedValueOnce({ text: transcriptText });
    const infoSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    try {
      await InterviewEngine.handleEvent({
        type: 'UTTERANCE_FINALIZED',
        blob: new Blob([new Uint8Array(512)]),
      });

      useAppStore.setState({
        status: 'generating',
        currentQuestion: duplicateQuestion,
      });
      await InterviewEngine.handleEvent({
        type: 'QUESTION_DETECTED',
        text: duplicateQuestion,
      });

      const consoleOutput = JSON.stringify([...infoSpy.mock.calls, ...logSpy.mock.calls]);
      expect(consoleOutput).not.toContain(transcriptText);
      expect(consoleOutput).not.toContain(duplicateQuestion);
      expect(infoSpy).toHaveBeenCalledWith(
        '[InterviewEngine] Utterance classified.',
        expect.objectContaining({
          type: 'CONVERSATIONAL_FILLER',
          transcriptCharacterCount: transcriptText.length,
        })
      );
    } finally {
      infoSpy.mockRestore();
      logSpy.mockRestore();
    }
  });

  it('transcribes consecutive finalized microphone segments in order without cancelling the first', async () => {
    InterviewEngine.abortActiveTranscription();
    vi.mocked(transcribeAudio).mockReset();
    const captureStateSpy = vi
      .spyOn(AudioRecorder.getInstance(), 'getCaptureState')
      .mockReturnValue('active');
    let resolveFirst: ((result: Awaited<ReturnType<typeof transcribeAudio>>) => void) | undefined;

    vi.mocked(transcribeAudio)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce({ text: 'Thank you.' });

    const first = InterviewEngine.enqueueFinalizedUtterance(new Blob([new Uint8Array(512)]));
    const second = InterviewEngine.enqueueFinalizedUtterance(new Blob([new Uint8Array(512)]));

    try {
      await vi.waitFor(() => expect(transcribeAudio).toHaveBeenCalledTimes(1));
      expect(transcribeAudio).toHaveBeenCalledTimes(1);

      resolveFirst?.({ text: 'Thank you.' });
      await Promise.all([first, second]);

      expect(transcribeAudio).toHaveBeenCalledTimes(2);
    } finally {
      resolveFirst?.({ text: 'Thank you.' });
      await Promise.allSettled([first, second]);
      captureStateSpy.mockRestore();
      InterviewEngine.abortActiveTranscription();
      vi.mocked(transcribeAudio).mockReset();
    }
  });

  it('preserves later queued speech when dispatching an automatically recognized question', async () => {
    const handleEventSpy = vi
      .spyOn(InterviewEngine, 'handleEvent')
      .mockResolvedValue(undefined);

    try {
      InterviewEngine.dispatchDetectedQuestion(
        'What happens when a database replica becomes unavailable?',
        'automatic-question-request'
      );

      await vi.waitFor(() => expect(handleEventSpy).toHaveBeenCalledOnce());
      expect(handleEventSpy).toHaveBeenCalledWith({
        type: 'QUESTION_DETECTED',
        text: 'What happens when a database replica becomes unavailable?',
        requestId: 'automatic-question-request',
        preserveQueuedUtterances: true,
      });
    } finally {
      handleEventSpy.mockRestore();
    }
  });

  it('allows manual trigger to generate answer from transcript via generateAnswerFromTranscript', async () => {
    const store = useAppStore.getState();
    const transcriptText = 'Explain how Raft consensus algorithm prevents split-brain.';

    store.setLastUnconfirmedTranscript({
      id: 'test-2',
      text: transcriptText,
      confidence: 0.6,
      reason: 'User manual confirmation',
      timestamp: Date.now(),
    });

    await store.generateAnswerFromTranscript(transcriptText);

    const updated = useAppStore.getState();
    expect(updated.lastUnconfirmedTranscript).toBeNull();
    expect(updated.currentQuestion).toBe(transcriptText);
  });
});
