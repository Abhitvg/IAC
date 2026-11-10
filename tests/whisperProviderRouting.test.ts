import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveTranscriptionProvider, transcribeAudio } from '../src/services/whisper';
import { encodeWav } from '../src/utils/audioConversion';

function createAudioBlob(): Blob {
  return encodeWav(new Float32Array(16_000).fill(0.05), 16_000);
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

  it('does not call cloud IPC or cloud endpoints in Ollama mode', async () => {
    const transcribeCloudAudio = vi.fn();
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: 'local transcript' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );

    vi.stubGlobal('window', { electronAPI: { transcribeCloudAudio } });
    vi.stubGlobal('fetch', fetchMock);

    const result = await transcribeAudio(createAudioBlob(), {
      aiProvider: 'ollama',
      whisperModel: 'local-whisper-cpp',
    });

    expect(result.text).toBe('local transcript');
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(fetchMock.mock.calls[0][0]).toBe('http://localhost:8080/inference');
    expect(transcribeCloudAudio).not.toHaveBeenCalled();
  });

  it('routes OpenAI transcription through Electron main without exposing the saved key', async () => {
    const transcribeCloudAudio = vi.fn().mockResolvedValue({ text: 'openai transcript' });
    const fetchMock = vi.fn();
    vi.stubGlobal('window', { electronAPI: { transcribeCloudAudio } });
    vi.stubGlobal('fetch', fetchMock);

    const result = await transcribeAudio(createAudioBlob(), {
      aiProvider: 'openai',
      whisperModel: 'whisper-1',
    });

    expect(result.text).toBe('openai transcript');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(transcribeCloudAudio).toHaveBeenCalledOnce();
    const request = transcribeCloudAudio.mock.calls[0][0];
    expect(request).toMatchObject({ provider: 'openai', model: 'whisper-1' });
    expect(request.audio).toBeInstanceOf(Uint8Array);
    expect(request.audio.byteLength).toBeGreaterThan(400);
    expect(request.prompt).toContain('AWS CodePipeline');
    expect(request).not.toHaveProperty('apiKey');
  });

  it('routes Groq transcription through Electron main without exposing the saved key', async () => {
    const transcribeCloudAudio = vi.fn().mockResolvedValue({ text: 'groq transcript' });
    const fetchMock = vi.fn();
    vi.stubGlobal('window', { electronAPI: { transcribeCloudAudio } });
    vi.stubGlobal('fetch', fetchMock);

    const result = await transcribeAudio(createAudioBlob(), {
      aiProvider: 'groq',
      whisperModel: 'whisper-large-v3-turbo',
    });

    expect(result.text).toBe('groq transcript');
    expect(fetchMock).not.toHaveBeenCalled();
    expect(transcribeCloudAudio).toHaveBeenCalledOnce();
    expect(transcribeCloudAudio.mock.calls[0][0]).toMatchObject({
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
    });
  });

  it('fails closed for OpenRouter because this app has no OpenRouter STT model', async () => {
    const transcribeCloudAudio = vi.fn();
    const fetchMock = vi.fn();

    vi.stubGlobal('window', { electronAPI: { transcribeCloudAudio } });
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      transcribeAudio(createAudioBlob(), {
        aiProvider: 'openrouter',
        whisperModel: 'whisper-large-v3-turbo',
      })
    ).rejects.toThrow('OpenRouter is not configured for speech transcription');

    expect(transcribeCloudAudio).not.toHaveBeenCalled();
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

  it('uses the default Groq STT model when a model from another provider is stored', async () => {
    const transcribeCloudAudio = vi.fn().mockResolvedValue({ text: 'groq transcript' });
    vi.stubGlobal('window', { electronAPI: { transcribeCloudAudio } });

    await transcribeAudio(createAudioBlob(), {
      aiProvider: 'groq',
      whisperModel: 'whisper-1',
    });

    expect(transcribeCloudAudio.mock.calls[0][0].model).toBe('whisper-large-v3-turbo');
  });

  it('uses the default OpenAI STT model when a Groq model is stored', async () => {
    const transcribeCloudAudio = vi.fn().mockResolvedValue({ text: 'openai transcript' });
    vi.stubGlobal('window', { electronAPI: { transcribeCloudAudio } });

    await transcribeAudio(createAudioBlob(), {
      aiProvider: 'openai',
      whisperModel: 'whisper-large-v3-turbo',
    });

    expect(transcribeCloudAudio.mock.calls[0][0].model).toBe('whisper-1');
  });
});
