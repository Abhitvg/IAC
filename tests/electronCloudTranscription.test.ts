import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  isValidCloudTranscriptionRequest,
  transcribeCloudAudio,
} from '../electron/services/cloudTranscriptionService';

const audio = new Uint8Array(1024).buffer;
const request = {
  requestId: 'test-request-1',
  provider: 'groq' as const,
  model: 'whisper-large-v3-turbo',
  audio,
  language: 'en',
  prompt: 'Technical interview',
};

describe('main-process cloud transcription boundary', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('accepts only bounded, supported transcription requests', () => {
    expect(isValidCloudTranscriptionRequest(request)).toBe(true);
    expect(isValidCloudTranscriptionRequest({ ...request, model: 'arbitrary-model' })).toBe(false);
    expect(isValidCloudTranscriptionRequest({ ...request, audio: new ArrayBuffer(100) })).toBe(
      false
    );
    expect(isValidCloudTranscriptionRequest({ ...request, prompt: 'x'.repeat(1001) })).toBe(false);
    expect(isValidCloudTranscriptionRequest({ ...request, language: '../secret' })).toBe(false);
  });

  it('resolves the key in main and returns only transcription data', async () => {
    const getKey = vi.fn().mockResolvedValue('gsk_private_main_process_key');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: 'A binary search tree stores ordered values.',
          language: 'en',
          duration: 3.2,
          segments: [{ start: 0, end: 3.2, text: 'A binary search tree stores ordered values.' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await transcribeCloudAudio({ getKey } as any, request);

    expect(getKey).toHaveBeenCalledWith('groq');
    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(new Headers(init.headers).get('authorization')).toBe(
      'Bearer gsk_private_main_process_key'
    );
    expect(init.body).toBeInstanceOf(FormData);
    expect((init.body as FormData).get('model')).toBe('whisper-large-v3-turbo');
    expect(result.text).toContain('binary search tree');
    expect(JSON.stringify(result)).not.toContain('gsk_private_main_process_key');
  });

  it('fails before network access when the saved provider key is absent', async () => {
    const getKey = vi.fn().mockResolvedValue(null);
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(transcribeCloudAudio({ getKey } as any, request)).rejects.toThrow(
      'A valid GROQ API key is required'
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('rejects malformed requests before reading credentials', async () => {
    const getKey = vi.fn();
    await expect(
      transcribeCloudAudio({ getKey } as any, { ...request, model: 'unknown-model' } as any)
    ).rejects.toThrow('Invalid cloud transcription request');
    expect(getKey).not.toHaveBeenCalled();
  });

  it('uses the selected provider endpoint and key namespace for OpenAI', async () => {
    const getKey = vi.fn().mockResolvedValue('sk-private-openai-key');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: 'OpenAI transcript' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await transcribeCloudAudio({ getKey } as any, {
      ...request,
      provider: 'openai',
      model: 'whisper-1',
    });

    expect(getKey).toHaveBeenCalledWith('openai');
    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/audio/transcriptions');
  });
});
