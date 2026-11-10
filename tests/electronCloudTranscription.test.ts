import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { transcribeCloudAudio } from '../electron/services/cloudTranscription';

const audio = new Uint8Array(1024).fill(7);
const request = {
  requestId: 'transcription-request-1',
  provider: 'groq' as const,
  model: 'whisper-large-v3-turbo',
  audio,
  language: 'en',
  prompt: 'Technical interview terminology',
};

describe('Electron main-process cloud transcription', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects missing credentials without making a provider request', async () => {
    await expect(transcribeCloudAudio(request, '', new AbortController().signal)).rejects.toThrow(
      'AUTH_INVALID_KEY'
    );
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('uploads audio to Groq from main with the saved credential', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          text: 'I built a Kubernetes deployment.',
          language: 'english',
          duration: 2.5,
          segments: [{ start: 0, end: 2.5, text: 'I built a Kubernetes deployment.' }],
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const result = await transcribeCloudAudio(
      request,
      'gsk_123456789012345678901234567890',
      new AbortController().signal
    );

    expect(result.text).toBe('I built a Kubernetes deployment.');
    expect(result.language).toBe('english');
    expect(result.duration).toBe(2.5);
    expect(result.segments).toHaveLength(1);
    const [url, options] = vi.mocked(global.fetch).mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
    expect(options?.headers).toMatchObject({
      Authorization: 'Bearer gsk_123456789012345678901234567890',
    });
    const form = options?.body as FormData;
    expect(form.get('model')).toBe('whisper-large-v3-turbo');
    expect(form.get('language')).toBe('en');
    expect(form.get('prompt')).toBe('Technical interview terminology');
    expect(form.get('response_format')).toBe('verbose_json');
    const file = form.get('file') as File;
    expect(file.name).toBe('recording.wav');
    expect(file.type).toBe('audio/wav');
    expect(file.size).toBe(audio.byteLength);
  });

  it('redacts provider credentials from failed transcription responses', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: { message: 'Invalid key gsk_123456789012345678901234567890' },
        }),
        { status: 401, headers: { 'Content-Type': 'application/json' } }
      )
    );

    await expect(
      transcribeCloudAudio(
        request,
        'gsk_123456789012345678901234567890',
        new AbortController().signal
      )
    ).rejects.toThrow('[AUTH_INVALID_KEY]');

    expect(vi.mocked(global.fetch).mock.calls).toHaveLength(1);
  });
});
