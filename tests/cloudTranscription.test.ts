import { afterEach, describe, expect, it, vi } from 'vitest';
import { transcribeCloudAudio } from '../electron/services/cloudTranscription';

const request = {
  requestId: 'stt-test-request',
  provider: 'groq' as const,
  model: 'whisper-large-v3-turbo',
  audio: new Uint8Array(1024),
  language: 'en',
  prompt: 'Technical interview vocabulary',
};

describe('Electron main-process cloud transcription', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('sends audio to the allowlisted provider with the main-process credential', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          text: 'A binary search tree stores ordered values.',
          language: 'en',
          duration: 2.4,
          segments: [{ start: 0, end: 2.4, text: 'A binary search tree stores ordered values.' }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await transcribeCloudAudio(
      request,
      'gsk_private_main_process_key',
      new AbortController().signal
    );

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

  it('rejects invalid provider credentials before making a network request', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      transcribeCloudAudio(request, 'not-a-groq-key', new AbortController().signal)
    ).rejects.toThrow('valid Groq API key');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('uses the OpenAI endpoint when OpenAI is selected', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: 'OpenAI transcript' }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    const result = await transcribeCloudAudio(
      { ...request, provider: 'openai', model: 'whisper-1' },
      'sk-private-openai-key',
      new AbortController().signal
    );

    expect(fetchMock.mock.calls[0][0]).toBe('https://api.openai.com/v1/audio/transcriptions');
    expect(result.text).toBe('OpenAI transcript');
  });

  it('redacts provider error details before returning them to the renderer', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('invalid credential gsk_private_main_process_key', {
        status: 401,
        headers: { 'content-type': 'text/plain' },
      })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(
      transcribeCloudAudio(
        request,
        'gsk_private_main_process_key',
        new AbortController().signal
      )
    ).rejects.not.toThrow('gsk_private_main_process_key');
  });
});
