import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InterviewEngine } from '../src/services/InterviewEngine';
import { AnswerGenerationService } from '../src/services/AnswerGenerationService';
import { useAppStore } from '../src/store/useAppStore';
import { classifyUtterance } from '../src/services/interruptionDetector';

const { transcribeAudioMock } = vi.hoisted(() => ({ transcribeAudioMock: vi.fn() }));

vi.mock('../src/services/whisper', () => ({
  transcribeAudio: (...args: unknown[]) => transcribeAudioMock(...args),
}));

describe('Automatic transcript routing flow', () => {
  beforeEach(() => {
    transcribeAudioMock.mockReset();
    useAppStore.setState({
      status: 'listening',
      pipelineStage: 'listening',
      currentQuestion: 'How do you monitor distributed systems?',
      currentAnswer:
        'Distributed tracing helps identify latency bottlenecks across service boundaries.',
      settings: { language: 'hi' },
      teleprompterQueue: [],
      transcript: [],
      lastUnconfirmedTranscript: null,
    });
  });

  it('does not treat a non-question statement as a question candidate', () => {
    const result = classifyUtterance(
      'Possibly tomorrow',
      'Distributed tracing helps identify latency bottlenecks across service boundaries.',
      []
    );

    expect(result.type).toBe('UNCLASSIFIED');
    expect(result.needsConfirmation).toBe(false);
    expect(result.questionText).toBe('Possibly tomorrow');
  });

  it('ignores ordinary candidate speech instead of retaining it as a question', async () => {
    transcribeAudioMock.mockResolvedValue({
      text: 'The architecture uses distributed tracing for service boundaries.',
    });

    await InterviewEngine.handleEvent({
      type: 'UTTERANCE_FINALIZED',
      blob: new Blob([new Uint8Array(600)]),
    });

    const state = useAppStore.getState();
    expect(state.lastUnconfirmedTranscript).toBeNull();
    expect(state.transcript).toHaveLength(0);
    expect(state.status).toBe('listening');
    expect(state.currentQuestion).toBe('How do you monitor distributed systems?');
    expect(state.currentAnswer).toBe(
      'Distributed tracing helps identify latency bottlenecks across service boundaries.'
    );
  });

  it('keeps answer generation alive when ordinary microphone speech is transcribed', async () => {
    let generationCallbacks: any;
    let generationRequestId = '';
    let releaseGeneration: ((value: any) => void) | undefined;
    const generationSpy = vi
      .spyOn(AnswerGenerationService.getInstance(), 'generateAnswer')
      .mockImplementation((params: any, callbacks: any) => {
        generationRequestId = params.requestId;
        generationCallbacks = callbacks;
        return new Promise((resolve) => {
          releaseGeneration = resolve;
        }) as any;
      });

    let generationPromise: Promise<void> | undefined;
    try {
      generationPromise = InterviewEngine.handleEvent({
        type: 'QUESTION_DETECTED',
        text: 'How do you handle idempotency in distributed systems?',
      });
      await Promise.resolve();

      expect(generationCallbacks).toBeDefined();
      expect(useAppStore.getState().status).toBe('analyzing');

      transcribeAudioMock.mockResolvedValue({
        text: 'I designed a retry-safe service with idempotency checks.',
      });
      await InterviewEngine.handleEvent({
        type: 'UTTERANCE_FINALIZED',
        blob: new Blob([new Uint8Array(600)]),
      });

      expect(useAppStore.getState().status).toBe('analyzing');
      expect(useAppStore.getState().pipelineStage).toBe('generating');
      expect(useAppStore.getState().lastUnconfirmedTranscript).toBeNull();

      generationCallbacks.onToken('generation-survived-microphone', generationRequestId);
      expect(useAppStore.getState().status).toBe('generating');
      expect(useAppStore.getState().pipelineStage).toBe('streaming');
      await vi.waitFor(() =>
        expect(useAppStore.getState().draftAnswer).toContain('generation-survived-microphone')
      );
    } finally {
      releaseGeneration?.({
        requestId: generationRequestId,
        status: 'ABORTED',
        cleanAnswer: '',
      });
      if (generationPromise) await generationPromise;
      generationSpy.mockRestore();
    }
  });

  it('discards a late microphone transcript after a new question takes ownership', async () => {
    let releaseTranscription: ((value: any) => void) | undefined;
    let pendingTranscript: Promise<void> | undefined;
    transcribeAudioMock.mockImplementation(
      () =>
        new Promise((resolve) => {
          releaseTranscription = resolve;
        }) as any
    );
    const generationSpy = vi
      .spyOn(AnswerGenerationService.getInstance(), 'generateAnswer')
      .mockResolvedValue(undefined as any);

    try {
      pendingTranscript = InterviewEngine.handleEvent({
        type: 'UTTERANCE_FINALIZED',
        blob: new Blob([new Uint8Array(600)]),
      });
      await Promise.resolve();
      expect(releaseTranscription).toBeDefined();

      await InterviewEngine.handleEvent({
        type: 'QUESTION_DETECTED',
        text: 'How do you design idempotent APIs?',
      });
      expect(useAppStore.getState().currentQuestion).toBe('How do you design idempotent APIs?');
      expect(useAppStore.getState().status).toBe('analyzing');

      releaseTranscription?.({ text: 'What about retries?' });
      await pendingTranscript;

      expect(useAppStore.getState().lastUnconfirmedTranscript).toBeNull();
      expect(useAppStore.getState().currentQuestion).toBe('How do you design idempotent APIs?');
      expect(useAppStore.getState().status).toBe('analyzing');
    } finally {
      releaseTranscription?.({ text: 'What about retries?' });
      if (pendingTranscript) await pendingTranscript;
      generationSpy.mockRestore();
    }
  });

  it('automatically routes question-shaped speech without transcript confirmation', async () => {
    const generationSpy = vi
      .spyOn(AnswerGenerationService.getInstance(), 'generateAnswer')
      .mockResolvedValue(undefined as any);
    transcribeAudioMock.mockResolvedValue({ text: 'What about tomorrow?' });

    try {
      await InterviewEngine.handleEvent({
        type: 'UTTERANCE_FINALIZED',
        blob: new Blob([new Uint8Array(600)]),
      });

      const state = useAppStore.getState();
      expect(state.lastUnconfirmedTranscript).toBeNull();
      expect(state.transcript).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            speaker: 'interviewer',
            classification: 'AUTO_ACCEPTED_QUESTION',
            text: 'What about tomorrow?',
          }),
        ])
      );
      expect(state.currentQuestion).toBe('What about tomorrow?');
    } finally {
      generationSpy.mockRestore();
    }
  });

  it('continues processing later microphone segments without a confirmation gate', async () => {
    const generationSpy = vi
      .spyOn(AnswerGenerationService.getInstance(), 'generateAnswer')
      .mockResolvedValue(undefined as any);
    transcribeAudioMock
      .mockResolvedValueOnce({ text: 'What about tomorrow?' })
      .mockResolvedValueOnce({ text: 'How would you handle retries?' });

    try {
      await InterviewEngine.handleEvent({
        type: 'UTTERANCE_FINALIZED',
        blob: new Blob([new Uint8Array(600)]),
      });
      await InterviewEngine.handleEvent({
        type: 'UTTERANCE_FINALIZED',
        blob: new Blob([new Uint8Array(600)]),
      });

      expect(transcribeAudioMock).toHaveBeenCalledTimes(2);
      expect(useAppStore.getState().lastUnconfirmedTranscript).toBeNull();
      expect(useAppStore.getState().currentQuestion).toBe('How would you handle retries?');
    } finally {
      generationSpy.mockRestore();
    }
  });

});
