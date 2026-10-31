import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useAppStore } from '../src/store/useAppStore';
import { InterviewEngine } from '../src/services/InterviewEngine';
import { AudioRecorder } from '../src/services/audio';

// Mock electronAPI
const mockElectronAPI = {
  getSessionsDir: vi.fn().mockResolvedValue('/mock/sessions'),
  listDir: vi.fn().mockResolvedValue([]),
  readFile: vi.fn(),
  writeFile: vi.fn().mockResolvedValue(true),
  deleteFile: vi.fn().mockResolvedValue(true),
  getSettings: vi.fn().mockResolvedValue({}),
  getApiKey: vi.fn().mockResolvedValue('gsk_test12345'),
};

(globalThis as any).window = {
  electronAPI: mockElectronAPI,
};

describe('State, Lifecycle & Engine Coordination Suite', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    useAppStore.setState({
      status: 'idle',
      recitalState: 'idle',
      currentQuestion: null,
      currentAnswer: null,
      transcript: [],
      questionHistory: [],
      redoQuestionHistory: [],
      sessionHistory: [],
      teleprompterQueue: [],
    });
  });

  it('handles START_LISTENING and STOP_LISTENING idempotently', async () => {
    const audioSpyStart = vi.spyOn(AudioRecorder.getInstance(), 'start').mockImplementation(async () => {});
    const audioSpyStop = vi.spyOn(AudioRecorder.getInstance(), 'stop').mockImplementation(async () => {});

    await InterviewEngine.handleEvent({ type: 'START_LISTENING' });
    expect(useAppStore.getState().status).toBe('listening');
    expect(audioSpyStart).toHaveBeenCalled();

    // Redundant start call when already listening does not start duplicate audio capture
    await InterviewEngine.handleEvent({ type: 'START_LISTENING' });
    expect(audioSpyStart).toHaveBeenCalledTimes(1);

    await InterviewEngine.handleEvent({ type: 'STOP_LISTENING' });
    expect(useAppStore.getState().status).toBe('idle');
    expect(audioSpyStop).toHaveBeenCalledWith(false);
  });

  it('regenerateAnswer dispatches REGENERATE_ACTIVE_ANSWER when a current question exists', () => {
    const engineSpy = vi.spyOn(InterviewEngine, 'handleEvent').mockImplementation(async () => {});
    useAppStore.setState({ currentQuestion: 'Explain CAP theorem in distributed systems' });

    useAppStore.getState().regenerateAnswer();
    expect(engineSpy).toHaveBeenCalledWith({ type: 'REGENERATE_ACTIVE_ANSWER' });
  });

  it('clearAllData cleanly purges all transcripts, history, and active session buffers', async () => {
    useAppStore.setState({
      status: 'ready',
      currentQuestion: 'Sample question',
      currentAnswer: 'Sample answer',
      transcript: [{ id: '1', speaker: 'user', text: 'hello', timestamp: 12345 }],
      questionHistory: [{ question: 'Q1', answer: 'A1' }],
      sessionHistory: [{ id: 's1', startTime: 1234, questions: [] }],
    });

    await useAppStore.getState().clearAllData();

    const state = useAppStore.getState();
    expect(state.status).toBe('idle');
    expect(state.currentQuestion).toBeNull();
    expect(state.currentAnswer).toBeNull();
    expect(state.transcript).toEqual([]);
    expect(state.questionHistory).toEqual([]);
    expect(state.sessionHistory).toEqual([]);
  });

  it('saves and deletes sessions correctly in session history', async () => {
    const mockSession = {
      id: 'session_test_1',
      startTime: Date.now(),
      mode: 'coding',
      targetRole: 'Software Engineer',
      questions: [{ question: 'Q', answer: 'A', category: 'Coding', timestamp: Date.now() }],
    };

    await useAppStore.getState().saveSession(mockSession);
    expect(useAppStore.getState().sessionHistory.some((s) => s.id === 'session_test_1')).toBe(true);

    await useAppStore.getState().deleteSession('session_test_1');
    expect(useAppStore.getState().sessionHistory.some((s) => s.id === 'session_test_1')).toBe(false);
  });

  it('preserves question undo/redo stack on history restoration', () => {
    useAppStore.setState({
      currentQuestion: 'Question 2',
      currentAnswer: 'Answer 2',
      questionHistory: [{ question: 'Question 1', answer: 'Answer 1' }],
      redoQuestionHistory: [],
    });

    const restored = useAppStore.getState().restorePreviousQuestion();
    expect(restored).toBe(true);
    expect(useAppStore.getState().currentQuestion).toBe('Question 1');
    expect(useAppStore.getState().redoQuestionHistory.length).toBe(1);

    const redone = useAppStore.getState().redoQuestion();
    expect(redone).toBe(true);
    expect(useAppStore.getState().currentQuestion).toBe('Question 2');
  });
});
