import { describe, it, expect, beforeEach } from 'vitest';
import { classifyUtterance } from '../src/services/interruptionDetector';
import { useAppStore } from '../src/store/useAppStore';
import { InterviewEngine } from '../src/services/InterviewEngine';
import { shouldAutoRouteUncertainQuestion } from '../src/services/interviewQuestionRouting';

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
