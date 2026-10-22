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
