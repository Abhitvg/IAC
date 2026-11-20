import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InterviewEngine } from '../src/services/InterviewEngine';
import { useAppStore } from '../src/store/useAppStore';
import { classifyUtterance } from '../src/services/interruptionDetector';

const { transcribeAudioMock } = vi.hoisted(() => ({ transcribeAudioMock: vi.fn() }));

vi.mock('../src/services/whisper', () => ({
  transcribeAudio: (...args: unknown[]) => transcribeAudioMock(...args),
}));

describe('Ambiguous transcript confirmation flow', () => {
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

  it('does not transcribe further microphone segments while a question awaits confirmation', async () => {
    transcribeAudioMock.mockResolvedValue({ text: 'What about tomorrow?' });

    await InterviewEngine.handleEvent({
      type: 'UTTERANCE_FINALIZED',
      blob: new Blob([new Uint8Array(600)]),
    });
    await InterviewEngine.handleEvent({
      type: 'UTTERANCE_FINALIZED',
      blob: new Blob([new Uint8Array(600)]),
    });

    expect(transcribeAudioMock).toHaveBeenCalledTimes(1);
    expect(useAppStore.getState().lastUnconfirmedTranscript?.text).toBe('What about tomorrow?');
  });

  it('preserves question-shaped speech and exposes an actionable confirmation state', async () => {
    transcribeAudioMock.mockResolvedValue({ text: 'What about tomorrow?' });

    await InterviewEngine.handleEvent({
      type: 'UTTERANCE_FINALIZED',
      blob: new Blob([new Uint8Array(600)]),
    });

    const state = useAppStore.getState();
    expect(state.transcript).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          speaker: 'unknown',
          classification: 'CONFIRMATION_REQUIRED',
          text: 'What about tomorrow?',
        }),
      ])
    );
    expect(state.lastUnconfirmedTranscript).toEqual(
      expect.objectContaining({
        text: 'What about tomorrow?',
        confidence: 0.35,
        reason: 'Speaker cannot be reliably attributed without audio diarization',
      })
    );
    expect(state.status).toBe('confirmation_required');
    expect(state.pipelineStage).toBe('confirmation_required');
    expect(state.currentQuestion).toBe('How do you monitor distributed systems?');
    expect(state.currentAnswer).toBe(
      'Distributed tracing helps identify latency bottlenecks across service boundaries.'
    );
    expect(transcribeAudioMock).toHaveBeenCalledWith(
      expect.any(Blob),
      expect.objectContaining({ language: 'hi' }),
      expect.any(AbortSignal)
    );
  });

  it('clears the pending transcript only after explicit confirmation and forwards the exact text', async () => {
    const handleEventSpy = vi
      .spyOn(InterviewEngine, 'handleEvent')
      .mockResolvedValue(undefined as never);
    try {
      const question = 'How does PostgreSQL row-level security isolate tenants?';
      useAppStore.getState().setLastUnconfirmedTranscript({
        id: 'pending-confirm',
        text: question,
        confidence: 0.55,
        reason: 'Speaker identity unavailable',
        timestamp: Date.now(),
      });
      await useAppStore.getState().overrideTranscriptAsQuestion(question);
      expect(handleEventSpy).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'QUESTION_DETECTED', text: question })
      );
      expect(useAppStore.getState().lastUnconfirmedTranscript).toBeNull();
      expect(useAppStore.getState().currentQuestion).toBe(
        'How do you monitor distributed systems?'
      );
      expect(useAppStore.getState().currentAnswer).toBe(
        'Distributed tracing helps identify latency bottlenecks across service boundaries.'
      );
    } finally {
      handleEventSpy.mockRestore();
    }
  });

  it('dismisses pending speech without changing the active Q&A', () => {
    useAppStore.getState().setLastUnconfirmedTranscript({
      id: 'pending-dismiss',
      text: 'What about retry semantics?',
      confidence: 0.55,
      reason: 'Speaker identity unavailable',
      timestamp: Date.now(),
    });
    useAppStore.getState().clearUnconfirmedTranscript();
    useAppStore.getState().setPipelineStage('listening');
    useAppStore.getState().setStatus('listening');
    const state = useAppStore.getState();
    expect(state.lastUnconfirmedTranscript).toBeNull();
    expect(state.status).toBe('listening');
    expect(state.pipelineStage).toBe('listening');
    expect(state.currentQuestion).toBe('How do you monitor distributed systems?');
    expect(state.currentAnswer).toBe(
      'Distributed tracing helps identify latency bottlenecks across service boundaries.'
    );
  });
});
