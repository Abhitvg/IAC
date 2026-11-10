import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  startCloudLLMStream,
  type CloudLLMStreamRequest,
} from '../electron/services/cloudLLMStreaming';

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

    const event = new Promise<{ channel: string; payload: Record<string, unknown> }>((resolve) => {
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
    });

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
  it.each([
    [': keep-alive\n\n', 'comment-only'],
    ['data:   \n\n', 'whitespace-only-data'],
    ['data: [DONE]\n\n', 'terminal-marker-only'],
    ['event: ping\n\n: heartbeat\n\n', 'event-and-comment-only'],
  ])('rejects %s SSE bodies without a data payload (%s)', async (body) => {
    const streamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode(body));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(streamBody, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      )
    );

    const request: CloudLLMStreamRequest = {
      requestId: 'empty-sse-test',
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
    const event = new Promise<{ channel: string; payload: Record<string, unknown> }>((resolve) => {
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
    });

    await expect(event).resolves.toMatchObject({
      channel: 'ai:stream-error',
      payload: {
        requestId: 'empty-sse-test',
        name: 'Error',
        message: 'Provider returned an empty streaming response.',
      },
    });
  });

  it('accepts a valid SSE data event even when it is split across stream chunks', async () => {
    const streamBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('data: {"choices":'));
        controller.enqueue(new TextEncoder().encode('[{"delta":{"content":"hello"}}]}\n\n'));
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(streamBody, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      )
    );

    const request: CloudLLMStreamRequest = {
      requestId: 'valid-sse-test',
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'You are a concise assistant.',
      question: 'Say hello.',
      temperature: 0.2,
      maxTokens: 64,
      stream: true,
    };
    const events: string[] = [];
    const credentials = {
      getKey: vi.fn().mockResolvedValue('sk-test-provider-key'),
    };
    await startCloudLLMStream(
      request,
      credentials as never,
      new AbortController().signal,
      (channel) => events.push(channel)
    );

    await vi.waitFor(() => expect(events).toContain('ai:stream-done'));
    expect(events).toContain('ai:stream-chunk');
    expect(events).not.toContain('ai:stream-error');
  });

  it('rejects streamed provider bodies that exceed the response byte budget', async () => {
    const oversizedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_CLOUD_LLM_RESPONSE_BYTES + 1));
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(oversizedBody, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      )
    );

    const request: CloudLLMStreamRequest = {
      requestId: 'oversized-stream-test',
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
    const terminalEvent = new Promise<{ channel: string; payload: Record<string, unknown> }>(
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

    await expect(terminalEvent).resolves.toMatchObject({
      channel: 'ai:stream-error',
      payload: {
        requestId: 'oversized-stream-test',
        message: `Provider streaming response exceeded maximum size limit of ${MAX_CLOUD_LLM_RESPONSE_BYTES} bytes.`,
      },
    });
  });

  it('bounds non-streaming successful provider response bodies', async () => {
    const oversizedBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(MAX_CLOUD_LLM_RESPONSE_BYTES + 1));
      },
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(oversizedBody, { status: 200 })));

    const request: CloudLLMStreamRequest = {
      requestId: 'oversized-nonstream-test',
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'You are a concise assistant.',
      question: 'Explain dependency injection.',
      temperature: 0.2,
      maxTokens: 256,
      stream: false,
    };
    const credentials = {
      getKey: vi.fn().mockResolvedValue('sk-test-provider-key'),
    };

    await expect(
      startCloudLLMStream(request, credentials as never, new AbortController().signal, vi.fn())
    ).rejects.toThrow(
      `Provider response exceeded maximum size limit of ${MAX_CLOUD_LLM_RESPONSE_BYTES} bytes.`
    );
  });
});
