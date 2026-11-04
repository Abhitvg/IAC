import { describe, it, expect, vi, beforeEach } from 'vitest';
import { streamAnswer } from '../src/services/ai';
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

  it('rejects with explicit empty response error when stream emits no tokens', async () => {
    // Empty stream mock
    const stream = new ReadableStream({
      start(controller) {
        controller.close();
      },
    });

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      headers: new Headers(),
      body: stream,
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
    expect(errorThrown.message).toContain('AI stream closed without emitting any answer content');
  });

  it('aborts the underlying fetch when the overall deadline expires', async () => {
    let fetchSignal: AbortSignal | undefined;
    global.fetch = vi.fn((_url: any, init: any) => {
      fetchSignal = init.signal;
      return new Promise(() => {});
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
      pull() { return new Promise(() => {}); },
      cancel() { cancelled = true; },
    });
    global.fetch = vi.fn().mockResolvedValue({
      ok: true, status: 200, headers: new Headers(), body: stream,
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
    await expect(streamAnswer('Explain B-trees', baseConfig, 'java' as any, {}))
      .rejects.toMatchObject({ status: 401 });
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
      encoder.encode('data: {"error":{"message":"Internal rate limit reached in stream","type":"rate_limit"}}\n\n'),
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
    await streamAnswer('Explain B-trees', baseConfig, 'java' as any, {
      onToken: () => {},
      onSentence: () => {},
      onComplete: () => {},
      onError: (err) => {
        caughtError = err;
      },
    });

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
          controller.enqueue(encoder.encode('data: {"choices":[{"delta":{"content":"A B-Tree is a self-balancing search tree."}}]}\n\n'));
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
    await streamAnswer('Explain B-trees', baseConfig, 'java' as any, {
      onToken: () => {},
      onSentence: () => {},
      onComplete: () => {},
      onError: (err) => {
        streamError = err;
      },
    });

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
});

