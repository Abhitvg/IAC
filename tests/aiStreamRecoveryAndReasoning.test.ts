import { describe, it, expect, vi } from 'vitest';
import { streamAnswer } from '../src/services/ai';
import { AIProviderConfig } from '../src/types';

describe('AI Stream Recovery and Fallback Chain', () => {
  it('recovers seamlessly via fallback chain when primary model returns an empty stream and recovery', async () => {
    let callCount = 0;
    const requestedModels: string[] = [];

    // Mock fetch to simulate primary model returning empty stream and empty non-streaming recovery,
    // and fallback model returning a valid answer.
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (_url, options) => {
      callCount++;
      const body = JSON.parse(options.body as string);
      requestedModels.push(body.model);

      if (body.stream) {
        // Stream returns [DONE] with zero content
        const encoder = new TextEncoder();
        const readable = new ReadableStream({
          start(controller) {
            controller.enqueue(encoder.encode('data: [DONE]\n\n'));
            controller.close();
          },
        });
        return new Response(readable, {
          status: 200,
          headers: { 'Content-Type': 'text/event-stream' },
        });
      } else {
        // Non-streaming call
        if (body.model === 'openai/gpt-oss-20b') {
          // Primary model recovery also returns empty content
          return new Response(
            JSON.stringify({
              choices: [{ message: { role: 'assistant', content: '' } }],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        } else {
          // Fallback model returns valid answer
          return new Response(
            JSON.stringify({
              choices: [
                {
                  message: {
                    role: 'assistant',
                    content:
                      'When scaling branching strategies, trunk-based development with short-lived feature branches and robust CI/CD eliminates integration bottlenecks.',
                  },
                },
              ],
            }),
            { status: 200, headers: { 'Content-Type': 'application/json' } }
          );
        }
      }
    });

    try {
      const config: AIProviderConfig = {
        type: 'groq',
        apiKey: 'gsk_test_mock_key_1234567890',
        model: 'openai/gpt-oss-20b',
        temperature: 0.7,
        maxTokens: 1500,
      };

      const emittedTokens: string[] = [];
      let completedText = '';

      await streamAnswer(
        'Thank you for explaining your branching strategy. Moving forward, when you scale...',
        config,
        'java' as any,
        {
          onToken: (token) => emittedTokens.push(token),
          onComplete: async (full) => {
            completedText = full;
          },
        }
      );

      expect(completedText).toContain('trunk-based development');
      expect(requestedModels).toContain('openai/gpt-oss-20b');
      // Should have attempted fallback to next active model in the chain
      expect(requestedModels.some((m) => m !== 'openai/gpt-oss-20b')).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('injects reasoning_format: hidden for Groq reasoning models in direct fetch calls', async () => {
    let capturedBody: any = null;
    const originalFetch = globalThis.fetch;
    globalThis.fetch = vi.fn().mockImplementation(async (_url, options) => {
      capturedBody = JSON.parse(options.body as string);
      const encoder = new TextEncoder();
      const readable = new ReadableStream({
        start(controller) {
          controller.enqueue(
            encoder.encode('data: {"choices":[{"delta":{"content":"Direct answer."}}]}\n\ndata: [DONE]\n\n')
          );
          controller.close();
        },
      });
      return new Response(readable, {
        status: 200,
        headers: { 'Content-Type': 'text/event-stream' },
      });
    });

    try {
      const config: AIProviderConfig = {
        type: 'groq',
        apiKey: 'gsk_test_mock_key_1234567890',
        model: 'openai/gpt-oss-20b',
        temperature: 0.7,
        maxTokens: 1500,
      };

      let completedText = '';
      await streamAnswer('Explain branching strategy', config, 'java' as any, {
        onComplete: async (full) => {
          completedText = full;
        },
      });

      expect(completedText).toBe('Direct answer.');
      expect(capturedBody).toBeDefined();
      expect(capturedBody.reasoning_format).toBe('hidden');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});

