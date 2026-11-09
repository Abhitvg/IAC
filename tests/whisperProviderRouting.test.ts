import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  resolveTranscriptionProvider,
  transcribeAudio,
} from '../src/services/whisper';
import { encodeWav } from '../src/utils/audioConversion';

function createAudioBlob(): Blob {
  return encodeWav(new Float32Array(16_000).fill(0.05), 16_000);
}

function mockTranscriptionResponse(text = 'transcribed words'): Response {
  return new Response(JSON.stringify({ text }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

describe('live transcription provider routing', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('maps the application Ollama setting to local Whisper', () => {
    expect(
      resolveTranscriptionProvider({
        aiProvider: 'ollama',
        whisperModel: 'local-whisper-cpp',
      })
    ).toBe('local');
  });

  it('does not call cloud credentials or cloud endpoints in Ollama mode', async () => {
    const getApiKey = vi.fn().mockResolvedValue('gsk_must_not_be_used');
    const fetchMock = vi.fn().mockResolvedValue(mockTranscriptionResponse('local transcript'));

    vi.stubGlobal('window', { electronAPI: { getApiKey } });
    vi.stubGlobal('fetch', fetchMock);

    const result = await transcribeAudio(createAudioBlob(), {
      aiProvider: 'ollama',
      whisperModel: 'local-whisper-cpp',
    });

    expect(result.text).toBe('local transcript');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/inference');
    expect(getApiKey).not.toHaveBeenCalled();
  });

  it('uses OpenAI transcription when OpenAI is the configured application provider', async () => {
    const getApiKey = vi.fn().mockResolvedValue('sk-openai-test-key');
    const fetchMock = vi.fn().mockResolvedValue(mockTranscriptionResponse('openai transcript'));

    vi.stubGlobal('window', { electronAPI: { getApiKey } });
    vi.stubGlobal('fetch', fetchMock);

    const result = await transcribeAudio(createAudioBlob(), {
      aiProvider: 'openai',
      whisperModel: 'whisper-1',
    });

    expect(result.text).toBe('openai transcript');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer sk-openai-test-key',
    });
    expect(getApiKey).toHaveBeenCalledOnce();
    expect(getApiKey).toHaveBeenCalledWith('openai');
  });

  it('uses Groq transcription when Groq is the configured application provider', async () => {
    const getApiKey = vi.fn().mockResolvedValue('gsk_groq-test-key');
    const fetchMock = vi.fn().mockResolvedValue(mockTranscriptionResponse('groq transcript'));

    vi.stubGlobal('window', { electronAPI: { getApiKey } });
    vi.stubGlobal('fetch', fetchMock);

    const result = await transcribeAudio(createAudioBlob(), {
      aiProvider: 'groq',
      whisperModel: 'whisper-large-v3-turbo',
    });

    expect(result.text).toBe('groq transcript');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(fetchMock.mock.calls[0][1].headers).toMatchObject({
      Authorization: 'Bearer gsk_groq-test-key',
    });
    expect(getApiKey).toHaveBeenCalledOnce();
    expect(getApiKey).toHaveBeenCalledWith('groq');
  });

  it('fails closed for OpenRouter because this app has no OpenRouter STT model', async () => {
    const getApiKey = vi.fn().mockResolvedValue('gsk_groq-test-key');
    const fetchMock = vi.fn();

    vi.stubGlobal('window', { electronAPI: { getApiKey } });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      transcribeAudio(createAudioBlob(), {
        aiProvider: 'openrouter',
        whisperModel: 'whisper-large-v3-turbo',
      })
    ).rejects.toThrow('OpenRouter is not configured for speech transcription');

    expect(getApiKey).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('allows an explicit local provider override to take precedence over cloud LLM settings', () => {
    expect(
      resolveTranscriptionProvider({
        provider: 'local',
        aiProvider: 'groq',
        whisperModel: 'whisper-large-v3-turbo',
      })
    ).toBe('local');
  });
});
