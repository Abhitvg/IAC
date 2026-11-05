import { afterEach, describe, expect, it, vi } from 'vitest';
import { streamAnswer } from '../src/services/ai';
import type { AIProviderConfig } from '../src/types';

describe('streamAnswer failure propagation', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects when both the provider stream and non-streaming recovery return no answer content', async () => {
    const onError = vi.fn();
    const emptyStream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.close();
      },
    });
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        new Response(emptyStream, {
          status: 200,
          headers: { 'content-type': 'text/event-stream' },
        })
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '' } }],
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          }
        )
      );
    vi.stubGlobal('fetch', fetchMock);

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
    ).rejects.toThrow('empty');

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[1][1]).toMatchObject({
      method: 'POST',
    });
    expect(JSON.parse(fetchMock.mock.calls[1][1].body)).toMatchObject({
      stream: false,
    });
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
  });
});
