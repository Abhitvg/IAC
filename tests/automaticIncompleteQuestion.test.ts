import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { InterviewEngine, QUESTION_CONTINUATION_GRACE_MS } from '../src/services/InterviewEngine';
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
    const handleEvent = vi.spyOn(InterviewEngine, 'handleEvent').mockResolvedValue(undefined);
    const firstPart = 'How would you design a system that...';
    const continuation = 'can handle one million concurrent users?';

    expect(InterviewEngine.beginPendingQuestionFromTranscript(firstPart, firstPart)).toBe(true);

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

    expect(InterviewEngine.appendPendingQuestionUtterance(continuation)).toBe('appended');
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

  it('cancels a stale incomplete question when candidate narration begins', async () => {
    const handleEvent = vi.spyOn(InterviewEngine, 'handleEvent').mockResolvedValue(undefined);
    const firstPart = 'How would you design a system that...';

    expect(InterviewEngine.beginPendingQuestionFromTranscript(firstPart, firstPart)).toBe(true);
    expect(
      InterviewEngine.appendPendingQuestionUtterance(
        'I would start by defining the service boundaries.'
      )
    ).toBe('candidate-speech');
    expect(useAppStore.getState().isIncompleteQuestionMode).toBe(false);

    await vi.advanceTimersByTimeAsync(QUESTION_CONTINUATION_GRACE_MS + 1100);
    expect(handleEvent).not.toHaveBeenCalled();
  });

  it('does not append harmless filler to a pending question', () => {
    const firstPart = 'How would you design a system that...';
    expect(InterviewEngine.beginPendingQuestionFromTranscript(firstPart, firstPart)).toBe(true);

    expect(InterviewEngine.appendPendingQuestionUtterance('okay')).toBe('ignored');
    expect(useAppStore.getState().isIncompleteQuestionMode).toBe(true);
    expect(useAppStore.getState().currentQuestion).toBe(firstPart);
  });

  it('clears a stale pending fragment before a distinct new question is classified', () => {
    const firstPart = 'How would you design a system that...';
    expect(InterviewEngine.beginPendingQuestionFromTranscript(firstPart, firstPart)).toBe(true);

    expect(InterviewEngine.appendPendingQuestionUtterance('What about failure recovery?')).toBe(
      'new-question'
    );
    expect(useAppStore.getState().isIncompleteQuestionMode).toBe(false);
    expect(useAppStore.getState().pipelineStage).toBe('listening');
  });

  it('does not generate anything when no pending question is active', () => {
    expect(InterviewEngine.appendPendingQuestionUtterance('under heavy load')).toBe('none');
  });
});
