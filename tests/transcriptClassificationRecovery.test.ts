import { describe, it, expect, beforeEach } from 'vitest';
import { classifyUtterance } from '../src/services/interruptionDetector';
import { useAppStore } from '../src/store/useAppStore';
import { InterviewEngine } from '../src/services/InterviewEngine';

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

  it('classifies a valid question asked after a previous answer is on screen as an interruption', () => {
    const speech = 'What trade-offs do you consider when choosing Kafka over RabbitMQ?';
    const result = classifyUtterance(speech, previousAnswer, [previousAnswer]);

    expect(result.type).toBe('INTERVIEWER_INTERRUPTION');
    expect(result.confidence).toBeGreaterThanOrEqual(0.85);
  });

  it('classifies follow-up questions containing words from the previous answer as INTERVIEWER_INTERRUPTION, not CANDIDATE_RECITAL', () => {
    // Has overlap on "distributed", "tracing", "OpenTelemetry"
    const followUp = 'Can you explain how OpenTelemetry sampling affects distributed tracing overhead?';
    const result = classifyUtterance(followUp, previousAnswer, [previousAnswer]);

    expect(result.type).toBe('INTERVIEWER_INTERRUPTION');
  });

  it('classifies multi-sentence questions with introductory remark correctly as interruption', () => {
    const speech = 'So looking at your architecture, how does your service handle database failover under high load?';
    const result = classifyUtterance(speech, previousAnswer, [previousAnswer]);

    expect(result.type).toBe('INTERVIEWER_INTERRUPTION');
    expect(result.questionText).toContain('database failover');
  });

  it('detects incomplete sentences in interviewer questions', () => {
    const incompleteSpeech = 'When scaling your database horizontally, what happens if...';
    const result = classifyUtterance(incompleteSpeech, previousAnswer, [previousAnswer]);

    expect(result.type).toBe('INTERVIEWER_INTERRUPTION');
    expect(result.isIncomplete).toBe(true);
  });

  it('classifies candidate speaking/repeating their teleprompted answer as CANDIDATE_RECITAL', () => {
    const candidateSpeech = 'distributed tracing with OpenTelemetry and Jaeger helps identify latency bottlenecks';
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

  it('stores ambiguous speech with needsConfirmation in lastUnconfirmedTranscript', () => {
    // 3+ words non-narrative with moderate overlap
    const speech = 'Distributed tracing telemetry overhead metrics.';
    const result = classifyUtterance(speech, previousAnswer, [previousAnswer]);

    if (result.needsConfirmation) {
      useAppStore.getState().setLastUnconfirmedTranscript({
        id: 'test-1',
        text: speech,
        confidence: result.confidence,
        reason: result.reason,
        timestamp: Date.now(),
      });
      useAppStore.getState().setPipelineStage('confirmation_required');

      const storeState = useAppStore.getState();
      expect(storeState.lastUnconfirmedTranscript).not.toBeNull();
      expect(storeState.lastUnconfirmedTranscript?.text).toBe(speech);
      expect(storeState.pipelineStage).toBe('confirmation_required');
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

