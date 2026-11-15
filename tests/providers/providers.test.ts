import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateEstimatedCost, LLMMessage } from '../../src/services/providers/types';
import {
  GroqProvider,
  OpenAIProvider,
  OpenRouterProvider,
  OllamaProvider,
  LLMManager,
} from '../../src/services/providers/LLMProvider';
import {
  OpenAIWhisperProvider,
  LocalWhisperCppProvider,
  STTManager,
} from '../../src/services/providers/STTProvider';
import {
  createProviderRequestSignal,
  fetchProviderWithRetry,
} from '../../src/services/providers/requestLifecycle';
import {
  BrowserSpeechTTSProvider,
  PiperLocalTTSProvider,
  TTSManager,
} from '../../src/services/providers/TTSProvider';

describe('Provider Interfaces & Cost Calculation', () => {
  it('calculates 0 cost for local providers (Ollama, local Whisper, Piper/Kokoro)', () => {
    expect(calculateEstimatedCost('ollama', 1000, 500)).toBe(0.0);
    expect(calculateEstimatedCost('local-whisper-cpp', 1000, 500)).toBe(0.0);
    expect(calculateEstimatedCost('piper-local', 1000, 500)).toBe(0.0);
    expect(calculateEstimatedCost('browser-speech', 1000, 500)).toBe(0.0);
  });

  it('calculates accurate token costs for cloud providers', () => {
    // OpenAI: 1,000,000 prompt tokens @ $0.15, 1,000,000 completion tokens @ $0.60
    const openaiCost = calculateEstimatedCost('openai', 1_000_000, 1_000_000);
    expect(openaiCost).toBeCloseTo(0.75, 2);

    // Groq: 1,000,000 prompt @ $0.59, 1,000,000 completion @ $0.79
    const groqCost = calculateEstimatedCost('groq', 1_000_000, 1_000_000);
    expect(groqCost).toBeCloseTo(1.38, 2);
  });
});

describe('LLM Providers Execution', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('OllamaProvider completes local chat completion with 0 cost', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Local response from Ollama' } }],
        usage: { prompt_tokens: 45, completion_tokens: 15 },
      }),
    });
    global.fetch = mockFetch;

    const ollama = new OllamaProvider('http://127.0.0.1:11434', 'llama3.2:1b');
    const response = await ollama.complete([
      { role: 'user', content: 'What is a binary search tree?' },
    ]);

    expect(response.text).toBe('Local response from Ollama');
    expect(response.isLocal ?? true).toBe(true);
    expect(response.estimatedCostUsd).toBe(0.0);
    expect(response.providerId).toBe('ollama');
  });

  it('GroqProvider completes chat completion and calculates estimated cost', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: 'Groq high-speed answer' } }],
        usage: { prompt_tokens: 100, completion_tokens: 50 },
      }),
    });
    global.fetch = mockFetch;

    const groq = new GroqProvider('gsk_testkey');
    const response = await groq.complete([{ role: 'user', content: 'Design URL shortener' }]);

    expect(response.text).toBe('Groq high-speed answer');
    expect(response.providerId).toBe('groq');
    expect(response.estimatedCostUsd).toBeGreaterThan(0);
  });
});

describe('LLMManager Fallback & Token Budget Guard', () => {
  it('enforces token budget per session', async () => {
    const manager = new LLMManager('groq', 500); // 500 token budget

    const mockProvider = {
      id: 'groq' as const,
      name: 'Groq',
      isLocal: false,
      complete: async () => ({
        text: 'first response',
        promptTokens: 300,
        completionTokens: 250, // total 550 tokens
        totalTokens: 550,
        estimatedCostUsd: 0.001,
        latencyMs: 150,
        providerId: 'groq',
        model: 'model',
      }),
      stream: vi.fn(),
      checkHealth: async () => ({ ok: true }),
    };

    manager.registerProvider(mockProvider);

    // First call succeeds and consumes 550 tokens
    await manager.executeWithFallback([{ role: 'user', content: 'Hello' }]);
    expect(manager.getSessionUsage().totalTokens).toBe(550);

    // Second call exceeds 500 budget and throws
    await expect(
      manager.executeWithFallback([{ role: 'user', content: 'Second question' }])
    ).rejects.toThrow('Token budget exceeded');
  });

  it('automatically falls back to secondary provider when primary fails', async () => {
    const manager = new LLMManager('groq', 10000);

    const failingGroq = {
      id: 'groq' as const,
      name: 'Groq',
      isLocal: false,
      complete: vi.fn().mockRejectedValue(new Error('Rate limit 429')),
      stream: vi.fn(),
      checkHealth: async () => ({ ok: false }),
    };

    const healthyOpenAI = {
      id: 'openai' as const,
      name: 'OpenAI',
      isLocal: false,
      complete: vi.fn().mockResolvedValue({
        text: 'Fallback answer from OpenAI',
        promptTokens: 80,
        completionTokens: 40,
        totalTokens: 120,
        estimatedCostUsd: 0.0001,
        latencyMs: 210,
        providerId: 'openai',
        model: 'gpt-4o-mini',
      }),
      stream: vi.fn(),
      checkHealth: async () => ({ ok: true }),
    };

    manager.registerProvider(failingGroq);
    manager.registerProvider(healthyOpenAI);

    const result = await manager.executeWithFallback([{ role: 'user', content: 'Test question' }]);

    expect(result.text).toBe('Fallback answer from OpenAI');
    expect(result.providerId).toBe('openai');
    expect(manager.getSessionUsage().providerFallbackCount).toBe(1);
  });
});

describe('15-Minute Offline Mock Session Simulation', () => {
  it('completes a multi-turn mock evaluation completely offline using Ollama and local Whisper with 0 cost', async () => {
    // 1. Setup local providers
    const mockOllamaFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [
          {
            message: {
              content: JSON.stringify({
                questions: [
                  {
                    id: 'q1',
                    type: 'behavioral',
                    dimensions: {
                      ownership: {
                        score: 4,
                        evidence: 'I led the migration',
                        note: 'clear ownership',
                      },
                    },
                    missed_points: [],
                    model_answer_outline: ['State situation', 'Explain trade-offs'],
                  },
                ],
                overall: {
                  score: 4.0,
                  summary: 'Strong structured STAR answer with verified metrics.',
                  top_fixes: [],
                  strengths: ['Clear leadership', 'Impact metric cited'],
                },
              }),
            },
          },
        ],
        usage: { prompt_tokens: 350, completion_tokens: 120 },
      }),
    });
    global.fetch = mockOllamaFetch;

    const ollama = new OllamaProvider('http://127.0.0.1:11434', 'llama3.2:1b');
    const llmManager = new LLMManager('ollama', 30000);
    llmManager.registerProvider(ollama);

    // Turn 1: Candidate answers out loud, Ollama scores the answer
    const evalResponse = await llmManager.executeWithFallback([
      { role: 'system', content: 'You are an interview evaluator.' },
      { role: 'user', content: 'Candidate answer: I led the migration of our monolithic service.' },
    ]);

    expect(evalResponse.providerId).toBe('ollama');
    expect(evalResponse.estimatedCostUsd).toBe(0.0);

    const parsedJson = JSON.parse(evalResponse.text);
    expect(parsedJson.overall.score).toBe(4.0);

    // Turn 2: Follow-up probing turn
    const probeResponse = await llmManager.executeWithFallback([
      { role: 'user', content: 'Probe the candidate on their migration strategy.' },
    ]);

    expect(probeResponse.providerId).toBe('ollama');
    expect(llmManager.getSessionUsage().totalEstimatedCostUsd).toBe(0.0);
    expect(llmManager.getSessionUsage().requestCount).toBe(2);
  });
});

describe('Provider request lifecycle and explicit audio fallback', () => {
  it('composes caller cancellation with a bounded provider deadline', async () => {
    const caller = new AbortController();
    const signal = createProviderRequestSignal(caller.signal, 5000);

    expect(signal.aborted).toBe(false);
    caller.abort(new Error('user cancelled'));
    expect(signal.aborted).toBe(true);
    expect(signal.reason).toBeDefined();

    const timeoutSignal = createProviderRequestSignal(undefined, 5);
    await new Promise<void>((resolve) => {
      timeoutSignal.addEventListener('abort', () => resolve(), { once: true });
    });
    expect(timeoutSignal.aborted).toBe(true);
    expect((timeoutSignal.reason as Error).name).toBe('TimeoutError');
  });

  it('does not send an LLM request after caller cancellation', async () => {
    const caller = new AbortController();
    caller.abort(new Error('cancelled by caller'));
    const mockFetch = vi.fn();
    global.fetch = mockFetch;

    const groq = new GroqProvider('gsk_testkey');
    await expect(
      groq.complete([{ role: 'user', content: 'hello' }], { signal: caller.signal })
    ).rejects.toThrow();
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('does not fail over LLM requests after caller cancellation', async () => {
    const caller = new AbortController();
    caller.abort();
    const manager = new LLMManager('groq', 10000);
    const failingGroq = {
      id: 'groq' as const,
      name: 'Groq',
      isLocal: false,
      complete: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      stream: vi.fn(),
      checkHealth: async () => ({ ok: false }),
    };
    const healthyOpenAI = {
      id: 'openai' as const,
      name: 'OpenAI',
      isLocal: false,
      complete: vi.fn(),
      stream: vi.fn(),
      checkHealth: async () => ({ ok: true }),
    };
    manager.registerProvider(failingGroq);
    manager.registerProvider(healthyOpenAI);

    await expect(
      manager.executeWithFallback([{ role: 'user', content: 'hello' }], {
        signal: caller.signal,
      })
    ).rejects.toThrow();
    expect(healthyOpenAI.complete).not.toHaveBeenCalled();
  });

  it('keeps STT on the selected provider unless cross-provider fallback is explicitly enabled', async () => {
    const manager = new STTManager('groq-whisper');
    const primary = {
      id: 'groq-whisper' as const,
      name: 'Groq Whisper',
      isLocal: false,
      transcribe: vi.fn().mockRejectedValue(new Error('primary unavailable')),
      checkHealth: async () => ({ ok: false }),
    };
    const secondary = {
      id: 'openai-whisper' as const,
      name: 'OpenAI Whisper',
      isLocal: false,
      transcribe: vi.fn().mockResolvedValue({
        transcript: 'fallback transcript',
        durationSeconds: 3,
        latencyMs: 10,
        estimatedCostUsd: 0.001,
        providerId: 'openai-whisper',
      }),
      checkHealth: async () => ({ ok: true }),
    };
    manager.register(primary);
    manager.register(secondary);
    const audio = new Blob(['test audio']);

    await expect(manager.transcribeWithFallback(audio)).rejects.toThrow(
      'All STT transcription providers failed'
    );
    expect(primary.transcribe).toHaveBeenCalledOnce();
    expect(secondary.transcribe).not.toHaveBeenCalled();

    const result = await manager.transcribeWithFallback(audio, { allowFallback: true });
    expect(result.providerId).toBe('openai-whisper');
    expect(secondary.transcribe).toHaveBeenCalledOnce();
  });

  it('never tries another STT provider after the caller cancels', async () => {
    const manager = new STTManager('groq-whisper');
    const caller = new AbortController();
    const primary = {
      id: 'groq-whisper' as const,
      name: 'Groq Whisper',
      isLocal: false,
      transcribe: vi
        .fn()
        .mockRejectedValue(Object.assign(new Error('aborted'), { name: 'AbortError' })),
      checkHealth: async () => ({ ok: false }),
    };
    const secondary = {
      id: 'openai-whisper' as const,
      name: 'OpenAI Whisper',
      isLocal: false,
      transcribe: vi.fn(),
      checkHealth: async () => ({ ok: true }),
    };
    manager.register(primary);
    manager.register(secondary);
    caller.abort();

    await expect(
      manager.transcribeWithFallback(new Blob(['test audio']), {
        allowFallback: true,
        signal: caller.signal,
      })
    ).rejects.toThrow();
    expect(secondary.transcribe).not.toHaveBeenCalled();
  });
});

describe('Bounded same-provider retry contract', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('retries transient HTTP 503 once before returning a successful response', async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('ok', { status: 200 }));
    global.fetch = mockFetch;

    const response = await fetchProviderWithRetry(
      'https://provider.example.test/completions',
      { method: 'POST' },
      { timeoutMs: 1000, maxRetries: 1, retryBaseDelayMs: 0 }
    );

    expect(response.status).toBe(200);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('does not retry authentication or malformed-request responses', async () => {
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('unauthorized', { status: 401 })
    );
    global.fetch = mockFetch;

    const response = await fetchProviderWithRetry(
      'https://provider.example.test/completions',
      { method: 'POST' },
      { timeoutMs: 1000, maxRetries: 2, retryBaseDelayMs: 0 }
    );

    expect(response.status).toBe(401);
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('stops retrying immediately when the caller cancels during backoff', async () => {
    const caller = new AbortController();
    const mockFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response('temporarily unavailable', { status: 503 })
    );
    global.fetch = mockFetch;

    const request = fetchProviderWithRetry(
      'https://provider.example.test/completions',
      { method: 'POST' },
      {
        signal: caller.signal,
        timeoutMs: 1000,
        maxRetries: 2,
        retryBaseDelayMs: 500,
      }
    );
    setTimeout(() => caller.abort(), 0);

    await expect(request).rejects.toThrow();
    expect(mockFetch).toHaveBeenCalledOnce();
  });

  it('retries an LLM request once when the provider returns a transient 503', async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: 'Recovered response' } }],
            usage: { prompt_tokens: 20, completion_tokens: 10 },
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );
    global.fetch = mockFetch;

    const provider = new GroqProvider('gsk_testkey');
    const result = await provider.complete([{ role: 'user', content: 'Hello' }], {
      timeoutMs: 1000,
      maxRetries: 1,
    });

    expect(result.text).toBe('Recovered response');
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });

  it('keeps STT same-provider retries disabled by default but supports explicit opt-in', async () => {
    const mockFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
      .mockResolvedValueOnce(new Response('temporarily unavailable', { status: 503 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ text: 'Recovered transcript', duration: 2 }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        })
      );
    global.fetch = mockFetch;

    const provider = new OpenAIWhisperProvider('sk-test', 'whisper-1');
    await expect(provider.transcribe(new Blob(['audio']))).rejects.toThrow('503');
    expect(mockFetch).toHaveBeenCalledOnce();

    const result = await provider.transcribe(new Blob(['audio']), {
      timeoutMs: 1000,
      maxRetries: 1,
    });
    expect(result.transcript).toBe('Recovered transcript');
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });
});
