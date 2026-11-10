import { afterEach, describe, expect, it, vi } from 'vitest';
import { AnswerGenerationService } from '../src/services/AnswerGenerationService';
import { RateLimitGovernor } from '../src/services/rateLimitGovernor';
import { startCloudLLMStream } from '../electron/services/cloudLLMStreaming';

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

function createElectronGateway(credentialStore: { getKey: ReturnType<typeof vi.fn> }) {
  const chunkListeners = new Set<(payload: any) => void>();
  const doneListeners = new Set<(payload: any) => void>();
  const errorListeners = new Set<(payload: any) => void>();
  const controllers = new Map<string, AbortController>();

  const send = (channel: string, payload: any) => {
    const listeners =
      channel === 'ai:stream-chunk'
        ? chunkListeners
        : channel === 'ai:stream-done'
          ? doneListeners
          : errorListeners;
    for (const listener of listeners) listener(payload);
  };

  return {
    startCloudLLMStream: async (request: any) => {
      const controller = new AbortController();
      controllers.set(request.requestId, controller);
      try {
        const result = await startCloudLLMStream(
          request,
          credentialStore as any,
          controller.signal,
          send
        );
        if (!result.ok) controllers.delete(request.requestId);
        return result;
      } catch (error) {
        controllers.delete(request.requestId);
        throw error;
      }
    },
    cancelCloudLLMStream: async (requestId: string) => {
      const controller = controllers.get(requestId);
      if (!controller) return false;
      controller.abort();
      controllers.delete(requestId);
      return true;
    },
    onAIStreamChunk: (callback: (payload: any) => void) => {
      chunkListeners.add(callback);
      return () => chunkListeners.delete(callback);
    },
    onAIStreamDone: (callback: (payload: any) => void) => {
      doneListeners.add(callback);
      return () => doneListeners.delete(callback);
    },
    onAIStreamError: (callback: (payload: any) => void) => {
      errorListeners.add(callback);
      return () => errorListeners.delete(callback);
    },
  };
}

describe('AnswerGenerationService main-process Groq credential failover', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('retries a primary Groq 429 with the secondary key without exposing either key to renderer', async () => {
    const credentialStore = {
      getKey: vi.fn(async (service: string) => {
        if (service === 'groq') return 'gsk_primary_test_key_12345678901234567890';
        if (service === 'groq-secondary') return 'gsk_secondary_test_key_12345678901234567890';
        return null;
      }),
    };
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

    const gateway = createElectronGateway(credentialStore);
    vi.stubGlobal('window', { electronAPI: gateway });
    vi.stubGlobal('fetch', fetchMock);

    const result = await AnswerGenerationService.getInstance().generateAnswer({
      requestId: 'groq-secondary-failover-test',
      type: 'interview',
      text: 'What is a binary search tree?',
      provider: 'groq',
      model: 'openai/gpt-oss-120b',
      preferredLanguage: 'Java',
    });

    expect(credentialStore.getKey).toHaveBeenCalledWith('groq');
    expect(credentialStore.getKey).toHaveBeenCalledWith('groq-secondary');
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(gateway).not.toHaveProperty('getApiKey');
    expect(result.status).toBe('VALIDATED');
    expect(result.cleanAnswer).toContain('binary search tree');
  });

  it('does not use a duplicate secondary key as a separate credential', async () => {
    vi.spyOn(RateLimitGovernor, 'calculateBackoffDelayMs').mockReturnValue(1);
    const credentialStore = {
      getKey: vi.fn(async () => 'gsk_same_test_key_12345678901234567890'),
    };
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

    const gateway = createElectronGateway(credentialStore);
    vi.stubGlobal('window', { electronAPI: gateway });
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
    expect(result.status).toBe('FAILED');
    expect(gateway).not.toHaveProperty('getApiKey');
  });
});
