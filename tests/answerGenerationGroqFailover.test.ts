import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnswerGenerationService } from '../src/services/AnswerGenerationService';

function createStreamingResponse(text: string): Response {
  const encoder = new TextEncoder();
  const payload = [
    `data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\n`,
    'data: [DONE]\n\n',
  ].join('');

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(encoder.encode(payload));
      controller.close();
    },
  });

  return new Response(stream, {
    status: 200,
    headers: { 'content-type': 'text/event-stream' },
  });
}

describe('AnswerGenerationService secondary Groq credential failover', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('retries a primary Groq 429 exactly once with the configured secondary key', async () => {
    const getApiKey = vi.fn(async (service: string) => {
      if (service === 'groq') return 'gsk_primary_test_key';
      if (service === 'groq-secondary') return 'gsk_secondary_test_key';
      return null;
    });

    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            error: {
              message:
                'Rate limit reached for model openai/gpt-oss-120b on tokens per minute (TPM): Limit 8000, Used 7900, Requested 500.',
              type: 'tokens',
              code: 'rate_limit_exceeded',
            },
          }),
          {
            status: 429,
            headers: {
              'content-type': 'application/json',
              'retry-after': '10',
              'x-ratelimit-reset-tokens': '10s',
            },
          }
        )
      )
      .mockResolvedValueOnce(
        createStreamingResponse('A binary search tree stores values in ordered nodes.')
      );

    vi.stubGlobal('window', { electronAPI: { getApiKey } });
    vi.stubGlobal('fetch', fetchMock);

    const result = await AnswerGenerationService.getInstance().generateAnswer({
      requestId: 'groq-secondary-failover-test',
      type: 'interview',
      text: 'What is a binary search tree?',
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      preferredLanguage: 'Java',
    });

    expect(getApiKey).toHaveBeenCalledWith('groq');
    expect(getApiKey).toHaveBeenCalledWith('groq-secondary');
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const firstInit = fetchMock.mock.calls[0][1] as RequestInit;
    const secondInit = fetchMock.mock.calls[1][1] as RequestInit;
    expect(new Headers(firstInit.headers).get('authorization')).toBe(
      'Bearer gsk_primary_test_key'
    );
    expect(new Headers(secondInit.headers).get('authorization')).toBe(
      'Bearer gsk_secondary_test_key'
    );

    expect(result.status).toBe('VALIDATED');
    expect(result.cleanAnswer).toContain('binary search tree');
  });

  it('does not retry with a duplicate secondary key', async () => {
    const getApiKey = vi.fn(async () => 'gsk_same_test_key');
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: {
            message:
              'Rate limit reached for model openai/gpt-oss-120b on tokens per minute (TPM): Limit 8000, Used 7900, Requested 500.',
            type: 'tokens',
            code: 'rate_limit_exceeded',
          },
        }),
        {
          status: 429,
          headers: {
            'content-type': 'application/json',
            'retry-after': '10',
            'x-ratelimit-reset-tokens': '10s',
          },
        }
      )
    );

    vi.stubGlobal('window', { electronAPI: { getApiKey } });
    vi.stubGlobal('fetch', fetchMock);

    const result = await AnswerGenerationService.getInstance().generateAnswer({
      requestId: 'groq-duplicate-key-test',
      type: 'interview',
      text: 'What is a binary search tree?',
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      preferredLanguage: 'Java',
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
    const authorizations = fetchMock.mock.calls.map((call) =>
      new Headers((call[1] as RequestInit).headers).get('authorization')
    );
    expect(authorizations).toEqual([
      'Bearer gsk_same_test_key',
      'Bearer gsk_same_test_key',
      'Bearer gsk_same_test_key',
    ]);
    expect(result.status).toBe('FAILED');
  });
});
