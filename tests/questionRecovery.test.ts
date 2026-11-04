import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../src/store/useAppStore';
import { isIncompleteSentence } from '../src/services/interruptionDetector';
import { InterviewEngine } from '../src/services/InterviewEngine';

describe('Question History & Incomplete Question Recovery', () => {
  beforeEach(() => {
    InterviewEngine.clearPendingQuestion();
    const store = useAppStore.getState();
    store.clearAnswerQueue();
    useAppStore.setState({
      questionHistory: [],
      redoQuestionHistory: [],
      isIncompleteQuestionMode: false,
      speechPauseTolerance: 1000,
      currentQuestion: null,
      currentAnswer: null,
    });
  });

  describe('Question History (Undo / Redo Stack)', () => {
    it('pushes question and answer to questionHistory', () => {
      const store = useAppStore.getState();
      store.pushToQuestionHistory({
        question: 'What is ACID in databases?',
        answer: 'ACID stands for Atomicity, Consistency, Isolation, Durability.',
        confidence: 'high',
      });

      const updated = useAppStore.getState();
      expect(updated.questionHistory.length).toBe(1);
      expect(updated.questionHistory[0].question).toBe('What is ACID in databases?');
      expect(updated.questionHistory[0].confidence).toBe('high');
    });

    it('returns false and displays warning when restoring on empty history', () => {
      const store = useAppStore.getState();
      const restored = store.restorePreviousQuestion();
      expect(restored).toBe(false);
    });

    it('successfully restores previous question, answer, and confidence on restorePreviousQuestion', () => {
      const store = useAppStore.getState();
      // Push first question to history
      store.pushToQuestionHistory({
        question: 'First Question: Explain CAP Theorem',
        answer: 'CAP theorem states Consistency, Availability, Partition tolerance.',
        confidence: 'high',
      });

      // Set active question to a spurious disruption
      useAppStore.setState({
        currentQuestion: 'Spurious background voice: hey are you there',
        currentAnswer: 'Generating spurious answer...',
        answerConfidence: 'low',
        status: 'analyzing',
      });

      // Candidate hits Back / Undo (⌘Z)
      const success = store.restorePreviousQuestion();
      expect(success).toBe(true);

      const stateAfterUndo = useAppStore.getState();
      expect(stateAfterUndo.currentQuestion).toBe('First Question: Explain CAP Theorem');
      expect(stateAfterUndo.currentAnswer).toBe(
        'CAP theorem states Consistency, Availability, Partition tolerance.'
      );
      expect(stateAfterUndo.answerConfidence).toBe('high');
      expect(stateAfterUndo.status).toBe('ready');
      expect(stateAfterUndo.questionHistory.length).toBe(0);
      expect(stateAfterUndo.redoQuestionHistory.length).toBe(1);
      expect(stateAfterUndo.redoQuestionHistory[0].question).toContain('Spurious background voice');
    });

    it('allows redoing forward if undo was accidental', () => {
      const store = useAppStore.getState();
      store.pushToQuestionHistory({
        question: 'Old Question',
        answer: 'Old Answer',
      });

      useAppStore.setState({
        currentQuestion: 'New Question',
        currentAnswer: 'New Answer',
      });

      store.restorePreviousQuestion();
      expect(useAppStore.getState().currentQuestion).toBe('Old Question');

      store.redoQuestion();
      expect(useAppStore.getState().currentQuestion).toBe('New Question');
      expect(useAppStore.getState().currentAnswer).toBe('New Answer');
    });

    it('clearAndResetToListen saves current question to history before wiping', () => {
      const store = useAppStore.getState();
      useAppStore.setState({
        currentQuestion: 'Explain Kafka partitioning',
        currentAnswer: 'Kafka partitions distribute messages for parallel consumption.',
        answerConfidence: 'high',
      });

      store.clearAndResetToListen();

      const state = useAppStore.getState();
      expect(state.currentQuestion).toBe(null);
      expect(state.currentAnswer).toBe(null);
      expect(state.questionHistory.length).toBe(1);
      expect(state.questionHistory[0].question).toBe('Explain Kafka partitioning');
    });
  });

  describe('Incomplete Question & Continuation Extension', () => {
    it('sets isIncompleteQuestionMode on markQuestionIncomplete', () => {
      const store = useAppStore.getState();
      useAppStore.setState({
        currentQuestion: 'Can you explain indexing in PostgreSQL',
        currentAnswer: 'PostgreSQL uses B-Tree indexes by default.',
      });

      store.markQuestionIncomplete();

      const state = useAppStore.getState();
      expect(state.isIncompleteQuestionMode).toBe(true);
      expect(state.status).toBe('listening');
      expect(state.recitalState).toBe('listening');
    });

    it('appends continuation utterance when isIncompleteQuestionMode is active', async () => {
      const store = useAppStore.getState();
      useAppStore.setState({
        currentQuestion: 'Can you explain indexing in PostgreSQL',
        isIncompleteQuestionMode: true,
      });

      // Interviewer resumes after breath pause: "...and specifically how GiST and GIN differ?"
      await InterviewEngine.handleEvent({
        type: 'QUESTION_DETECTED',
        text: 'and specifically how GiST and GIN indexes differ?',
      });

      const state = useAppStore.getState();
      expect(state.currentQuestion).toBe(
        'Can you explain indexing in PostgreSQL ... and specifically how GiST and GIN indexes differ?'
      );
      expect(state.isIncompleteQuestionMode).toBe(false);
    });

    it('caps repeated continuations at the hard finalization deadline', async () => {
      vi.useFakeTimers();
      const handleEventSpy = vi.spyOn(InterviewEngine, 'handleEvent').mockResolvedValue(undefined);

      try {
        useAppStore.setState({
          currentQuestion: 'How does PostgreSQL indexing work',
          speechPauseTolerance: 1000,
        });
        InterviewEngine.markQuestionPendingFinalization();

        for (let i = 0; i < 4; i++) {
          await vi.advanceTimersByTimeAsync(3000);
          expect(InterviewEngine.appendPendingQuestionUtterance(`continuation ${i}`)).toBe(true);
        }

        await vi.advanceTimersByTimeAsync(3001);
        expect(handleEventSpy).toHaveBeenCalledWith(
          expect.objectContaining({ type: 'QUESTION_DETECTED' })
        );
        expect(InterviewEngine.appendPendingQuestionUtterance('too late')).toBe(false);
      } finally {
        handleEventSpy.mockRestore();
        vi.useRealTimers();
      }
    });

    it('clears pending finalization when listening is stopped', async () => {
      vi.useFakeTimers();
      const handleEventSpy = vi.spyOn(InterviewEngine, 'handleEvent').mockResolvedValue(undefined);

      try {
        useAppStore.setState({ currentQuestion: 'How does PostgreSQL indexing work' });
        InterviewEngine.markQuestionPendingFinalization();
        InterviewEngine.clearPendingQuestion();
        await vi.advanceTimersByTimeAsync(20000);
        expect(handleEventSpy).not.toHaveBeenCalled();
      } finally {
        handleEventSpy.mockRestore();
        vi.useRealTimers();
      }
    });

    it('detects incomplete sentences ending in conjunctions or punctuation', () => {
      expect(isIncompleteSentence('Tell me about your experience with React and')).toBe(true);
      expect(isIncompleteSentence('How does Garbage Collection work because')).toBe(true);
      expect(isIncompleteSentence('Explain Docker containers vs VMs,')).toBe(true);
      expect(isIncompleteSentence('What is the difference between TCP and UDP?')).toBe(false);
      expect(isIncompleteSentence('Explain QuickSort in Java.')).toBe(false);
    });
  });

  describe('Speech Pause Tolerance Configuration', () => {
    it('updates and clamps speechPauseTolerance within safe bounds', () => {
      const store = useAppStore.getState();

      store.setSpeechPauseTolerance(1500);
      expect(useAppStore.getState().speechPauseTolerance).toBe(1500);

      // Lower bound clamp (>= 400ms)
      store.setSpeechPauseTolerance(100);
      expect(useAppStore.getState().speechPauseTolerance).toBe(400);

      // Upper bound clamp (<= 3500ms)
      store.setSpeechPauseTolerance(9000);
      expect(useAppStore.getState().speechPauseTolerance).toBe(3500);
    });
  });
});
