import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { validateCloudModelPreflight } from '../electron/services/modelPreflight';

describe('Electron main-process cloud model preflight', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('does not make a network request when a saved key is missing', async () => {
    const result = await validateCloudModelPreflight('groq', 'llama-3.3-70b-versatile', '');

    expect(result.valid).toBe(false);
    expect(result.code).toBe('AUTH_INVALID_KEY');
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('probes Groq from the main process using the selected model and stored key', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ choices: [{ message: { content: 'pong' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      })
    );

    const result = await validateCloudModelPreflight(
      'groq',
      'llama-3.3-70b-versatile',
      'gsk_123456789012345678901234567890'
    );

    expect(result.valid).toBe(true);
    expect(result.latencyMs).toEqual(expect.any(Number));
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, options] = vi.mocked(global.fetch).mock.calls[0];
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(options?.headers).toMatchObject({
      Authorization: 'Bearer gsk_123456789012345678901234567890',
    });
    expect(JSON.parse(String(options?.body))).toMatchObject({
      model: 'llama-3.3-70b-versatile',
      max_tokens: 1,
    });
  });

  it('classifies provider rate limits without returning credential material', async () => {
    vi.mocked(global.fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: {
            message: 'Rate limit reached for key gsk_123456789012345678901234567890',
          },
        }),
        { status: 429, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const result = await validateCloudModelPreflight(
      'groq',
      'llama-3.3-70b-versatile',
      'gsk_123456789012345678901234567890'
    );

    expect(result.valid).toBe(false);
    expect(result.code).toBe('RATE_LIMITED');
    expect(result.message).not.toContain('gsk_123456789012345678901234567890');
    expect(result.message).toContain('[REDACTED_GROQ_KEY]');
  });
});
