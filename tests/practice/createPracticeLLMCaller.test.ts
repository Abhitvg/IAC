import { describe, expect, it, vi } from 'vitest';
import { createPracticeLLMCaller } from '../../src/services/practice/createPracticeLLMCaller';

const settings = {
  aiProvider: 'groq',
  aiModel: 'llama-3.3-70b-versatile',
  temperature: 0.4,
  maxTokens: 1200,
} as any;

describe('createPracticeLLMCaller', () => {
  it('routes practice prompts through the main-process credential boundary', async () => {
    const startCloudLLMStream = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      headers: {},
      body: JSON.stringify({ choices: [{ message: { content: '{"action":"probe"}' } }] }),
    });
    const caller = createPracticeLLMCaller({
      getSettings: vi.fn().mockResolvedValue(settings),
      startCloudLLMStream,
    } as any);

    await expect(caller('Ask a focused follow-up.', 'ignored-model')).resolves.toBe(
      '{"action":"probe"}'
    );

    expect(startCloudLLMStream).toHaveBeenCalledWith(
      expect.objectContaining({
        provider: 'groq',
        model: settings.aiModel,
        question: 'Ask a focused follow-up.',
        stream: false,
      })
    );
    expect(JSON.stringify(startCloudLLMStream.mock.calls)).not.toContain('apiKey');
  });

  it('rejects unsupported local providers rather than leaking credentials to renderer fetches', async () => {
    const startCloudLLMStream = vi.fn();
    const caller = createPracticeLLMCaller({
      getSettings: vi.fn().mockResolvedValue({ ...settings, aiProvider: 'ollama' }),
      startCloudLLMStream,
    } as any);

    await expect(caller('Ask a follow-up.', 'model')).rejects.toThrow(
      'Mock interviewer AI currently requires Groq, OpenAI, or OpenRouter.'
    );
    expect(startCloudLLMStream).not.toHaveBeenCalled();
  });

  it('rejects provider errors and malformed completion payloads', async () => {
    const getSettings = vi.fn().mockResolvedValue(settings);
    const errorCaller = createPracticeLLMCaller({
      getSettings,
      startCloudLLMStream: vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        body: 'Rate limit reached',
      }),
    } as any);
    await expect(errorCaller('Prompt', 'model')).rejects.toThrow('Rate limit reached');

    const malformedCaller = createPracticeLLMCaller({
      getSettings,
      startCloudLLMStream: vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        body: '{"choices":[]}',
      }),
    } as any);
    await expect(malformedCaller('Prompt', 'model')).rejects.toThrow(
      'AI provider response did not contain generated text.'
    );
  });

  it('rejects empty and oversized prompts before IPC', async () => {
    const startCloudLLMStream = vi.fn();
    const caller = createPracticeLLMCaller({
      getSettings: vi.fn().mockResolvedValue(settings),
      startCloudLLMStream,
    } as any);

    await expect(caller(' ', 'model')).rejects.toThrow('Practice prompt is empty');
    await expect(caller('x'.repeat(30_001), 'model')).rejects.toThrow(
      'Practice prompt is empty or exceeds the supported size limit.'
    );
    expect(startCloudLLMStream).not.toHaveBeenCalled();
  });
});
