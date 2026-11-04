import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamAnswer } from '../src/services/ai';
import type { AIProviderConfig } from '../src/types';

describe('streamAnswer failure propagation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects when a provider closes the stream without answer content', async () => {
    const onError = vi.fn();
    const emptyStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(emptyStream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      )
    );

    const config: AIProviderConfig = {
      type: 'groq',
      apiKey: 'gsk_test_key',
      model: 'llama-3.3-70b-versatile',
      temperature: 0.2,
      maxTokens: 128,
      systemPrompt: 'Test system prompt',
    };

    await expect(
      streamAnswer('Explain the event loop', config, 'java', { onError })
    ).rejects.toThrow('empty response');

    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
