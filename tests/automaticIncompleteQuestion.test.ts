import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  InterviewEngine,
  QUESTION_CONTINUATION_GRACE_MS,
} from '../src/services/InterviewEngine';
import { useAppStore } from '../src/store/useAppStore';

describe('automatic incomplete interviewer questions', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    InterviewEngine.clearPendingQuestion();
    useAppStore.setState({
      status: 'generating',
      pipelineStage: 'streaming',
      currentQuestion: 'How do you monitor distributed systems?',
      currentAnswer: 'I use metrics, logs, and traces.',
      questionHistory: [],
      isIncompleteQuestionMode: false,
      speechPauseTolerance: 1000,
    });
  });

  afterEach(() => {
    InterviewEngine.clearPendingQuestion();
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('holds an incomplete question, appends the continuation, then generates once', async () => {
    const handleEvent = vi
      .spyOn(InterviewEngine, 'handleEvent')
      .mockResolvedValue(undefined);
    const firstPart = 'How would you design a system that...';
    const continuation = 'can handle one million concurrent users?';

    expect(
      InterviewEngine.beginPendingQuestionFromTranscript(firstPart, firstPart)
    ).toBe(true);

    const pendingState = useAppStore.getState();
    expect(pendingState.currentQuestion).toBe(firstPart);
    expect(pendingState.currentAnswer).toBeNull();
    expect(pendingState.isIncompleteQuestionMode).toBe(true);
    expect(pendingState.pipelineStage).toBe('pending_finalization');
    expect(pendingState.questionHistory).toHaveLength(1);
    expect(pendingState.questionHistory[0].question).toBe(
      'How do you monitor distributed systems?'
    );
    expect(handleEvent).not.toHaveBeenCalled();

    expect(InterviewEngine.appendPendingQuestionUtterance(continuation)).toBe(true);
    expect(useAppStore.getState().currentQuestion).toBe(
      'How would you design a system that can handle one million concurrent users?'
    );
    expect(handleEvent).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(QUESTION_CONTINUATION_GRACE_MS + 1100);

    expect(handleEvent).toHaveBeenCalledTimes(1);
    expect(handleEvent).toHaveBeenCalledWith({
      type: 'QUESTION_DETECTED',
      text: 'How would you design a system that can handle one million concurrent users?',
      originalTranscript: `${firstPart} ${continuation}`,
    });
    expect(useAppStore.getState().isIncompleteQuestionMode).toBe(false);
  });

  it('does not generate anything when no pending question is active', () => {
    expect(InterviewEngine.appendPendingQuestionUtterance('under heavy load')).toBe(false);
  });
});
