import { afterEach, describe, expect, it, vi } from 'vitest';
import { startCloudLLMStream, type CloudLLMStreamRequest } from '../electron/services/cloudLLMStreaming';

describe('cloud LLM streaming response handling', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reports an empty successful stream as an error instead of a completed answer', async () => {
    const emptyBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    const fetchMock = vi.fn().mockResolvedValue(new Response(emptyBody, { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);

    const request: CloudLLMStreamRequest = {
      requestId: 'empty-stream-test',
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'You are a concise assistant.',
      question: 'Explain dependency injection.',
      temperature: 0.2,
      maxTokens: 256,
      stream: true,
    };
    const credentials = {
      getKey: vi.fn().mockResolvedValue('sk-test-provider-key'),
    };

    const event = new Promise<{ channel: string; payload: Record<string, unknown> }>(
      (resolve) => {
        void startCloudLLMStream(
          request,
          credentials as never,
          new AbortController().signal,
          (channel, payload) => {
            if (channel === 'ai:stream-error' || channel === 'ai:stream-done') {
              resolve({ channel, payload });
            }
          }
        );
      }
    );

    await expect(event).resolves.toMatchObject({
      channel: 'ai:stream-error',
      payload: {
        requestId: 'empty-stream-test',
        name: 'Error',
        message: 'Provider returned an empty streaming response.',
      },
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
