import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  MAX_RENDERER_LLM_ERROR_BYTES,
  MAX_RENDERER_LLM_RESPONSE_BYTES,
  streamAnswer,
} from '../src/services/ai';
import { AIProviderConfig } from '../src/types';

describe('Suite B: Streaming Reliability', () => {
  const baseConfig: AIProviderConfig = {
    type: 'groq',
    apiKey: 'gsk_test_key_123456789012345678901234567890',
    model: 'openai/gpt-oss-120b',
    temperature: 0.2,
    maxTokens: 500,
  };

  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('recovers once with a non-streaming request when the provider closes an empty stream', async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({ ok: true, status: 200, headers: new Headers(), body: stream } as any)
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: 'A B-tree is a balanced search tree.' } }],
        }),
      } as any);

    let fullAnswer = '';
    await streamAnswer('Explain B-trees', baseConfig, 'java' as any, {
      onToken: (token) => {
        fullAnswer += token;
      },
      onComplete: (answer) => {
        fullAnswer = answer;
      },
    });

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(fullAnswer).toContain('balanced search tree');
  });

  it('consumes a final SSE event even when the stream omits its trailing newline', async () => {
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"choices":[{"delta":{"content":"Recovered final event."}}]}')
        );
        controller.close();
      },
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: stream,
    } as any);

    let fullAnswer = '';
    await streamAnswer('Explain B-trees', baseConfig, 'java' as any, {
      onToken: (token) => {
        fullAnswer += token;
      },
      onComplete: (answer) => {
        fullAnswer = answer;
      },
    });
    expect(fullAnswer).toContain('Recovered final event.');
  });

  it('aborts the underlying fetch when the overall deadline expires', async () => {
    let fetchSignal: AbortSignal | undefined;
    global.fetch = vi.fn((_url: any, init: any) => {
      fetchSignal = init.signal;
      return new Promise((_resolve, reject) => {
        init.signal.addEventListener(
          'abort',
          () => {
            reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
          },
          { once: true }
        );
      });
    }) as any;

    await expect(
      streamAnswer('Explain B-trees', baseConfig, 'java' as any, {}, undefined, {
        overallTimeoutMs: 20,
        inactivityTimeoutMs: 10,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });

    expect(fetchSignal?.aborted).toBe(true);
  });

  it('aborts a stalled stream reader on inactivity deadline', async () => {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start() {},
      cancel() {
        cancelled = true;
      },
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: stream,
    } as any);

    await expect(
      streamAnswer('Explain B-trees', baseConfig, 'java' as any, {}, undefined, {
        overallTimeoutMs: 1000,
        inactivityTimeoutMs: 20,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    expect(cancelled).toBe(true);
  });

  it('does not treat Groq authentication failure as a model fallback opportunity', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 401,
      statusText: 'Unauthorized',
      headers: new Headers(),
      text: async () => '{"error":{"message":"invalid_api_key"}}',
    } as any);
    await expect(
      streamAnswer('Explain B-trees', baseConfig, 'java' as any, {})
    ).rejects.toMatchObject({ status: 401 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('throws error when response body is missing', async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: null,
    } as any);

    let errorThrown: any = null;
    try {
      await streamAnswer('Explain B-trees', baseConfig, 'java' as any, {
        onToken: () => {},
        onSentence: () => {},
        onComplete: () => {},
        onError: (err) => {
          errorThrown = err;
        },
      });
    } catch (err: any) {
      errorThrown = err;
    }

    expect(errorThrown).not.toBeNull();
    expect(errorThrown.message).toContain('No response body');
  });

  it('handles in-stream provider error objects (data: {"error": ...}) without swallowing', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode('data: {"choices":[{"delta":{"content":"Starting answer..."}}]}\n\n'),
      encoder.encode(
        'data: {"error":{"message":"Internal rate limit reached in stream","type":"rate_limit"}}\n\n'
      ),
    ];

    let chunkIdx = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (chunkIdx < chunks.length) {
          controller.enqueue(chunks[chunkIdx++]);
        } else {
          controller.close();
        }
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: stream,
    } as any);

    let caughtError: any = null;
    await expect(
      streamAnswer('Explain B-trees', baseConfig, 'java' as any, {
        onToken: () => {},
        onSentence: () => {},
        onComplete: () => {},
        onError: (err) => {
          caughtError = err;
        },
      })
    ).rejects.toMatchObject({ hasEmittedTokens: true });

    expect(caughtError).not.toBeNull();
    expect(caughtError.message).toContain('Internal rate limit reached in stream');
  });

  it('handles mid-stream interruption, marking hasEmittedTokens and preserving partial text', async () => {
    const encoder = new TextEncoder();
    let hasEmittedFirst = false;

    const stream = new ReadableStream({
      pull(controller) {
        if (!hasEmittedFirst) {
          hasEmittedFirst = true;
          controller.enqueue(
            encoder.encode(
              'data: {"choices":[{"delta":{"content":"A B-Tree is a self-balancing search tree."}}]}\n\n'
            )
          );
        } else {
          controller.error(new Error('Network connection drop'));
        }
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: stream,
    } as any);

    let streamError: any = null;
    await expect(
      streamAnswer('Explain B-trees', baseConfig, 'java' as any, {
        onToken: () => {},
        onSentence: () => {},
        onComplete: () => {},
        onError: (err) => {
          streamError = err;
        },
      })
    ).rejects.toMatchObject({ hasEmittedTokens: true });

    expect(streamError).not.toBeNull();
    expect(streamError.hasEmittedTokens).toBe(true);
    expect(streamError.partialText).toContain('self-balancing search tree');
  });

  it('correctly parses SSE chunks with various whitespace and format differences', async () => {
    const encoder = new TextEncoder();
    const chunks = [
      encoder.encode('data:{"choices":[{"delta":{"content":"Hello"}}]}\n\n'),
      encoder.encode('data: {"choices":[{"delta":{"content":" World"}}]}\n\n'),
      encoder.encode('data: [DONE]\n\n'),
    ];

    let idx = 0;
    const stream = new ReadableStream({
      pull(controller) {
        if (idx < chunks.length) {
          controller.enqueue(chunks[idx++]);
        } else {
          controller.close();
        }
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: stream,
    } as any);

    let fullAnswer = '';
    await streamAnswer('Say hello', baseConfig, 'java' as any, {
      onToken: (tok) => {
        fullAnswer += tok;
      },
      onSentence: () => {},
      onComplete: (ans) => {
        fullAnswer = ans;
      },
    });

    expect(fullAnswer.trim()).toBe('Hello World');
  });
  it('cancels renderer streams that exceed the cumulative response byte limit', async () => {
    let cancelled = false;
    const oversizedChunk = new Uint8Array(MAX_RENDERER_LLM_RESPONSE_BYTES + 1);
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(oversizedChunk);
      },
      cancel() {
        cancelled = true;
      },
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: stream,
    } as any);

    await expect(streamAnswer('Explain B-trees', baseConfig, 'java' as any, {})).rejects.toThrow(
      `AI provider response exceeded the ${MAX_RENDERER_LLM_RESPONSE_BYTES}-byte limit.`
    );
    expect(cancelled).toBe(true);
  });

  it('bounds provider error bodies before classification', async () => {
    const oversizedBody = new Uint8Array(MAX_RENDERER_LLM_ERROR_BYTES + 1);
    global.fetch = vi.fn().mockResolvedValue(
      new Response(oversizedBody, {
        status: 401,
        statusText: 'Unauthorized',
        headers: { 'content-type': 'application/json' },
      })
    );

    await expect(
      streamAnswer('Explain B-trees', baseConfig, 'java' as any, {})
    ).rejects.toMatchObject({ status: 401 });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('bounds non-streaming recovery JSON responses', async () => {
    const emptyStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    global.fetch = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: new Headers(),
        body: emptyStream,
      })
      .mockResolvedValueOnce(
        new Response(new Uint8Array(MAX_RENDERER_LLM_RESPONSE_BYTES + 1), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );

    await expect(streamAnswer('Explain B-trees', baseConfig, 'java' as any, {})).rejects.toThrow(
      `AI provider response exceeded the ${MAX_RENDERER_LLM_RESPONSE_BYTES}-byte limit.`
    );
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
});
