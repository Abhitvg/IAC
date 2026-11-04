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
      currentAnswer:
        'Distributed tracing helps identify latency bottlenecks across service boundaries.',
      teleprompterQueue: [],
      transcript: [],
      lastUnconfirmedTranscript: null,
    });
  });

  it('uses the UNCLASSIFIED type for speech that cannot safely be attributed', () => {
    const result = classifyUtterance(
      'Possibly tomorrow',
      'Distributed tracing helps identify latency bottlenecks across service boundaries.',
      []
    );

    expect(result.type).toBe('UNCLASSIFIED');
    expect(result.questionText).toBe('Possibly tomorrow');
  });

  it('preserves ambiguous speech and exposes an actionable confirmation state', async () => {
    transcribeAudioMock.mockResolvedValue({ text: 'Possibly tomorrow' });

    await InterviewEngine.handleEvent({
      type: 'UTTERANCE_FINALIZED',
      blob: new Blob([new Uint8Array(600)]),
    });

    const state = useAppStore.getState();
    expect(state.transcript).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          speaker: 'unknown',
          classification: 'UNCLASSIFIED',
          text: 'Possibly tomorrow',
        }),
      ])
    );
    expect(state.lastUnconfirmedTranscript).toEqual(
      expect.objectContaining({
        text: 'Possibly tomorrow',
        confidence: 0.35,
      })
    );
    expect(state.status).toBe('confirmation_required');
    expect(state.pipelineStage).toBe('confirmation_required');
    expect(state.isRecording).toBe(true);
  });
});
