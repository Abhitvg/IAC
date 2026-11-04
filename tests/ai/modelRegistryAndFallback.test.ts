import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  MODEL_REGISTRY,
  getModelDefinition,
  getActiveModelsForProvider,
  getDefaultModelForProvider,
  resolveOrMigrateModel,
  getModelFallbackChain,
  classifyAIError,
  sanitizeDiagnosticSecret,
  createSafeDiagnosticRecord,
  createTinyPreflightWavBlob,
  validateModelPreflight,
  FallbackDiagnosticRecord,
} from '../../src/services/models/modelRegistry';
import { streamAnswer, generateAIAnswer } from '../../src/services/ai';
import { transcribeAudio } from '../../src/services/whisper';
import { useAppStore } from '../../src/store/useAppStore';

function createValidWavBlob(): Blob {
  const buffer = new ArrayBuffer(44 + 400);
  const view = new DataView(buffer);
  // "RIFF"
  view.setUint32(0, 0x52494646, false);
  // File length
  view.setUint32(4, 36 + 400, true);
  // "WAVE"
  view.setUint32(8, 0x57415645, false);
  // "fmt "
  view.setUint32(12, 0x666d7420, false);
  // Subchunk1Size (16 for PCM)
  view.setUint32(16, 16, true);
  // AudioFormat (1 for PCM)
  view.setUint16(20, 1, true);
  // NumChannels (1)
  view.setUint16(22, 1, true);
  // SampleRate (16000)
  view.setUint32(24, 16000, true);
  // ByteRate (16000 * 2)
  view.setUint32(28, 32000, true);
  // BlockAlign (2)
  view.setUint16(32, 2, true);
  // BitsPerSample (16)
  view.setUint16(34, 16, true);
  // "data"
  view.setUint32(36, 0x64617461, false);
  // Subchunk2Size (400)
  view.setUint32(40, 400, true);
  return new Blob([buffer], { type: 'audio/wav' });
}

describe('Authoritative Model Registry & AI Reliability Governor', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.clearAllMocks();
    (global as any).window = (global as any).window || {};
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  // =========================================================================
  // 1. Current Groq Model IDs
  // =========================================================================
  describe('Requirement 1 & 2: Authoritative Model Registry Catalog', () => {
    it('defines active Groq production models with correct capabilities and limits', () => {
      const activeGroqModels = getActiveModelsForProvider('groq', 'llm');
      const activeIds = activeGroqModels.map((m) => m.id);

      expect(activeIds).toContain('openai/gpt-oss-120b');
      expect(activeIds).toContain('openai/gpt-oss-20b');
      expect(activeIds).toContain('qwen/qwen3.8-27b');

      const gpt120b = getModelDefinition('groq', 'openai/gpt-oss-120b');
      expect(gpt120b).toBeDefined();
      expect(gpt120b?.status).toBe('active');
      expect(gpt120b?.supportsStreaming).toBe(true);
      expect(gpt120b?.contextWindow).toBe(131072);
      expect(gpt120b?.capabilities).toContain('reasoning');
      expect(gpt120b?.capabilities).toContain('streaming');

      const defaultGroqLlm = getDefaultModelForProvider('groq', 'llm');
      expect(defaultGroqLlm).toBe('openai/gpt-oss-120b');
    });

    it('defines active Groq STT (Whisper) models with audio modalities', () => {
      const activeGroqStt = getActiveModelsForProvider('groq', 'stt');
      const sttIds = activeGroqStt.map((m) => m.id);

      expect(sttIds).toContain('whisper-large-v3-turbo');
      expect(sttIds).toContain('whisper-large-v3');

      const turbo = getModelDefinition('groq', 'whisper-large-v3-turbo');
      expect(turbo).toBeDefined();
      expect(turbo?.inputModalities).toContain('audio');
      expect(turbo?.outputModalities).toContain('text');
      expect(turbo?.isDefault).toBe(true);

      const defaultStt = getDefaultModelForProvider('groq', 'stt');
      expect(defaultStt).toBe('whisper-large-v3-turbo');
    });
  });

  // =========================================================================
  // 2. Deprecated Model Migration
  // =========================================================================
  describe('Requirement 3: Deprecated Model Migration & Preference Preservation', () => {
    it('migrates retired llama-3.3-70b-versatile to openai/gpt-oss-120b with notice', () => {
      const res = resolveOrMigrateModel('groq', 'llama-3.3-70b-versatile', 'llm');
      expect(res.wasMigrated).toBe(true);
      expect(res.resolvedModel).toBe('openai/gpt-oss-120b');
      expect(res.reason).toBe('model_retired');
      expect(res.notice).toContain('Retired by Groq');
    });

    it('migrates retired llama-3.1-8b-instant to openai/gpt-oss-20b with notice', () => {
      const res = resolveOrMigrateModel('groq', 'llama-3.1-8b-instant', 'llm');
      expect(res.wasMigrated).toBe(true);
      expect(res.resolvedModel).toBe('openai/gpt-oss-20b');
      expect(res.reason).toBe('model_retired');
    });

    it('migrates retired mixtral-8x7b-32768 to openai/gpt-oss-120b', () => {
      const res = resolveOrMigrateModel('groq', 'mixtral-8x7b-32768', 'llm');
      expect(res.wasMigrated).toBe(true);
      expect(res.resolvedModel).toBe('openai/gpt-oss-120b');
    });

    it('migrates retired gemma2-9b-it to openai/gpt-oss-20b', () => {
      const res = resolveOrMigrateModel('groq', 'gemma2-9b-it', 'llm');
      expect(res.wasMigrated).toBe(true);
      expect(res.resolvedModel).toBe('openai/gpt-oss-20b');
    });

    it('preserves valid active user model selection without overwriting', () => {
      const res20b = resolveOrMigrateModel('groq', 'openai/gpt-oss-20b', 'llm');
      expect(res20b.wasMigrated).toBe(false);
      expect(res20b.resolvedModel).toBe('openai/gpt-oss-20b');

      const resQwen = resolveOrMigrateModel('groq', 'qwen/qwen3.8-27b', 'llm');
      expect(resQwen.wasMigrated).toBe(false);
      expect(resQwen.resolvedModel).toBe('qwen/qwen3.8-27b');
    });

    it('resolves empty or undefined model to provider default', () => {
      const resEmpty = resolveOrMigrateModel('groq', '', 'llm');
      expect(resEmpty.resolvedModel).toBe('openai/gpt-oss-120b');
      expect(resEmpty.wasMigrated).toBe(false);
    });

    it('preserves custom model strings and does not blindly overwrite them', () => {
      const customGroq = resolveOrMigrateModel('groq', 'custom-enterprise-llama-lora-v2', 'llm');
      expect(customGroq.wasMigrated).toBe(false);
      expect(customGroq.resolvedModel).toBe('custom-enterprise-llama-lora-v2');

      const customHf = resolveOrMigrateModel('groq', 'meta-llama/Llama-3-8b-instruct', 'llm');
      expect(customHf.wasMigrated).toBe(false);
      expect(customHf.resolvedModel).toBe('meta-llama/Llama-3-8b-instruct');
    });

    it('preserves non-Groq providers (OpenAI, Ollama, OpenRouter) without rewriting', () => {
      const openAiRes = resolveOrMigrateModel('openai', 'gpt-4o', 'llm');
      expect(openAiRes.wasMigrated).toBe(false);
      expect(openAiRes.resolvedModel).toBe('gpt-4o');

      const ollamaRes = resolveOrMigrateModel('ollama', 'llama3:8b', 'llm');
      expect(ollamaRes.wasMigrated).toBe(false);
      expect(ollamaRes.resolvedModel).toBe('llama3:8b');

      const openRouterRes = resolveOrMigrateModel('openrouter', 'anthropic/claude-3.5-sonnet', 'llm');
      expect(openRouterRes.wasMigrated).toBe(false);
      expect(openRouterRes.resolvedModel).toBe('anthropic/claude-3.5-sonnet');
    });

    it('guarantees migration idempotence: re-resolving a migrated model produces no further migration', () => {
      const firstPass = resolveOrMigrateModel('groq', 'llama-3.3-70b-versatile', 'llm');
      expect(firstPass.wasMigrated).toBe(true);
      expect(firstPass.resolvedModel).toBe('openai/gpt-oss-120b');

      const secondPass = resolveOrMigrateModel('groq', firstPass.resolvedModel, 'llm');
      expect(secondPass.wasMigrated).toBe(false);
      expect(secondPass.resolvedModel).toBe('openai/gpt-oss-120b');
    });
  });

  // =========================================================================
  // 3. Saved-Settings Migration Across Application Restarts
  // =========================================================================
  describe('Requirement 3: Settings Migration on Load & State Persistence', () => {
    it('detects deprecated models upon loading settings and writes migration notice to store', async () => {
      const mockSetSettings = vi.fn();
      (window as any).electronAPI = {
        getSettings: vi.fn().mockResolvedValue({
          aiProvider: 'groq',
          aiModel: 'llama-3.3-70b-versatile',
          whisperModel: 'whisper-large-v3-turbo',
        }),
        setSettings: mockSetSettings,
      };

      await useAppStore.getState().loadSettings();

      const currentSettings = useAppStore.getState().settings;
      expect(currentSettings.aiModel).toBe('openai/gpt-oss-120b');
      expect(currentSettings.lastModelMigrationNotice).toBeDefined();
      expect(currentSettings.lastModelMigrationNotice?.previousModel).toBe('llama-3.3-70b-versatile');
      expect(currentSettings.lastModelMigrationNotice?.newModel).toBe('openai/gpt-oss-120b');
      expect(mockSetSettings).toHaveBeenCalledWith('aiModel', 'openai/gpt-oss-120b');
    });
  });

  // =========================================================================
  // 4. Model-Not-Found (404) Fallback Behavior
  // =========================================================================
  describe('Requirement 4: Model Fallback on Recoverable 404 Model-Not-Found', () => {
    it('falls back to secondary model when primary model returns 404 model_not_found and records sanitized diagnostic', async () => {
      const diagnostics: FallbackDiagnosticRecord[] = [];

      // First fetch: 404 model_not_found for primary model
      // Second fetch: 200 OK SSE stream for fallback model
      const mockFetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          statusText: 'Not Found',
          text: async () => JSON.stringify({ error: { message: 'model_not_found: openai/gpt-oss-120b' } }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          body: {
            getReader: () => {
              let done = false;
              return {
                read: async () => {
                  if (done) return { done: true, value: undefined };
                  done = true;
                  const chunk = 'data: {"choices":[{"delta":{"content":"Fallback success answer"}}]}\n\ndata: [DONE]\n\n';
                  return { done: false, value: new TextEncoder().encode(chunk) };
                },
                releaseLock: () => {},
                cancel: async () => {},
              };
            },
          },
        });

      global.fetch = mockFetch;

      let receivedToken = '';
      let receivedComplete = '';

      await streamAnswer(
        'What is an event loop?',
        {
          type: 'groq',
          apiKey: 'gsk_test_secret_key_1234567890abcdef',
          model: 'openai/gpt-oss-120b',
        },
        'javascript',
        {
          onToken: (tok) => {
            receivedToken += tok;
          },
          onComplete: (full) => {
            receivedComplete = full;
          },
          onDiagnostic: (diag) => {
            diagnostics.push(diag);
          },
        }
      );

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(receivedToken).toContain('Fallback success answer');
      expect(receivedComplete).toContain('Fallback success answer');

      expect(diagnostics.length).toBe(1);
      expect(diagnostics[0].successful).toBe(true);
      expect(diagnostics[0].originalModel).toBe('openai/gpt-oss-120b');
      expect(diagnostics[0].fallbackModel).toBe('openai/gpt-oss-20b');
      expect(diagnostics[0].triggerError.code).toBe('MODEL_NOT_FOUND');
    });
  });

  // =========================================================================
  // 5. Non-Recoverable Errors: Must NEVER Silently Fallback
  // =========================================================================
  describe('Requirement 4: Strict Refusal to Fallback on Non-Recoverable Errors', () => {
    it('throws immediately on 401 Invalid Key without attempting fallback', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => JSON.stringify({ error: { message: 'Invalid API Key provided' } }),
      });
      global.fetch = mockFetch;

      const errorCallback = vi.fn();
      await streamAnswer(
        'Explain quicksort',
        {
          type: 'groq',
          apiKey: 'gsk_bad_key',
          model: 'openai/gpt-oss-120b',
        },
        'java',
        {
          onError: errorCallback,
        }
      );

      // Must have called fetch exactly ONCE (no fallback attempt)
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalled();
      const err = errorCallback.mock.calls[0][0];
      expect(err.code).toBe('AUTH_INVALID_KEY');
      expect(err.isRecoverableByModelFallback).toBe(false);
    });

    it('throws immediately on 402 Payment Required without attempting fallback', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 402,
        statusText: 'Payment Required',
        text: async () => JSON.stringify({ error: { message: 'Billing account suspended or credit exhausted' } }),
      });
      global.fetch = mockFetch;

      const errorCallback = vi.fn();
      await streamAnswer(
        'Explain red-black trees',
        {
          type: 'groq',
          apiKey: 'gsk_valid_key',
          model: 'openai/gpt-oss-120b',
        },
        'java',
        {
          onError: errorCallback,
        }
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalled();
      const err = errorCallback.mock.calls[0][0];
      expect(err.code).toBe('BILLING_PAYMENT_REQUIRED');
      expect(err.isRecoverableByModelFallback).toBe(false);
    });

    it('throws immediately on 403 Forbidden without attempting fallback', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        text: async () => JSON.stringify({ error: { message: 'User lacks permission to access this resource' } }),
      });
      global.fetch = mockFetch;

      const errorCallback = vi.fn();
      await streamAnswer(
        'Explain trie structures',
        {
          type: 'groq',
          apiKey: 'gsk_valid_key',
          model: 'openai/gpt-oss-120b',
        },
        'java',
        {
          onError: errorCallback,
        }
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalled();
      const err = errorCallback.mock.calls[0][0];
      expect(err.code).toBe('AUTH_FORBIDDEN');
      expect(err.isRecoverableByModelFallback).toBe(false);
    });

    it('throws immediately on Generic 404 (Endpoint Not Found) without attempting fallback', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => '<!DOCTYPE html><html><body>404 Not Found: Cannot POST /openai/v1/invalid_path</body></html>',
      });
      global.fetch = mockFetch;

      const errorCallback = vi.fn();
      await streamAnswer(
        'Explain Dijkstra algorithm',
        {
          type: 'groq',
          apiKey: 'gsk_valid_key',
          model: 'openai/gpt-oss-120b',
        },
        'java',
        {
          onError: errorCallback,
        }
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalled();
      const err = errorCallback.mock.calls[0][0];
      expect(err.code).toBe('ENDPOINT_NOT_FOUND');
      expect(err.isRecoverableByModelFallback).toBe(false);
    });

    it('refuses fallback on misleading error phrases such as "model does not exist" in unrelated contexts', async () => {
      // Unrelated database error containing "model does not exist"
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () =>
          JSON.stringify({
            error: { message: 'Database schema: User profile data model does not exist in local SQLite table' },
          }),
      });
      global.fetch = mockFetch;

      const errorCallback = vi.fn();
      await streamAnswer(
        'Explain binary trees',
        {
          type: 'groq',
          apiKey: 'gsk_valid_key',
          model: 'openai/gpt-oss-120b',
        },
        'java',
        { onError: errorCallback }
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalled();
      const err = errorCallback.mock.calls[0][0];
      expect(err.isRecoverableByModelFallback).toBe(false);
      expect(err.code).not.toBe('MODEL_NOT_FOUND');
      expect(err.code).not.toBe('MODEL_DECOMMISSIONED');
    });

    it('refuses fallback on proxy/gateway errors containing generic model phrasing', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 502,
        statusText: 'Bad Gateway',
        text: async () =>
          JSON.stringify({
            error: { message: 'Proxy routing error: upstream cluster model does not exist on gateway' },
          }),
      });
      global.fetch = mockFetch;

      const errorCallback = vi.fn();
      await streamAnswer(
        'Explain B-trees',
        {
          type: 'groq',
          apiKey: 'gsk_valid_key',
          model: 'openai/gpt-oss-120b',
        },
        'java',
        { onError: errorCallback }
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalled();
      const err = errorCallback.mock.calls[0][0];
      expect(err.code).toBe('SERVER_ERROR');
      expect(err.isRecoverableByModelFallback).toBe(false);
    });

    it('throws immediately on 429 Rate Limit without attempting fallback', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        headers: new Headers({ 'retry-after': '60' }),
        text: async () => JSON.stringify({ error: { message: 'Rate limit reached for requests' } }),
      });
      global.fetch = mockFetch;

      const errorCallback = vi.fn();
      await streamAnswer(
        'Explain binary search',
        {
          type: 'groq',
          apiKey: 'gsk_valid_key',
          model: 'openai/gpt-oss-120b',
        },
        'java',
        {
          onError: errorCallback,
        }
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalled();
      const err = errorCallback.mock.calls[0][0];
      expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(err.isRecoverableByModelFallback).toBe(false);
    });

    it('correctly classifies Groq 429 TPM error containing settings/billing URL as RATE_LIMIT_EXCEEDED', async () => {
      const groq429Body = {
        error: {
          message:
            "Rate limit reached for model 'openai/gpt-oss-120b' on tokens per minute (TPM): Limit 8000, Used 5713, Requested 4321. Please try again in 15.254s. Need more tokens? Upgrade to Dev Tier today at https://console.groq.com/settings/billing",
          type: 'tokens',
          code: 'rate_limit_exceeded',
        },
      };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        text: async () => JSON.stringify(groq429Body),
      });
      global.fetch = mockFetch;

      const errorCallback = vi.fn();
      await streamAnswer(
        'Describe a bug you fixed',
        {
          type: 'groq',
          apiKey: 'gsk_valid_key',
          model: 'openai/gpt-oss-120b',
        },
        'java',
        { onError: errorCallback }
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalled();
      const err = errorCallback.mock.calls[0][0];
      expect(err.code).toBe('RATE_LIMIT_EXCEEDED');
      expect(err.code).not.toBe('BILLING_PAYMENT_REQUIRED');
      expect(err.isRecoverableByModelFallback).toBe(false);
    });

    it('throws immediately on 5xx Server Error without attempting fallback', async () => {
      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 503,
        statusText: 'Service Unavailable',
        text: async () => JSON.stringify({ error: { message: 'Groq upstream service temporarily unavailable' } }),
      });
      global.fetch = mockFetch;

      const errorCallback = vi.fn();
      await streamAnswer(
        'Explain LRU cache',
        {
          type: 'groq',
          apiKey: 'gsk_valid_key',
          model: 'openai/gpt-oss-120b',
        },
        'java',
        {
          onError: errorCallback,
        }
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalled();
      const err = errorCallback.mock.calls[0][0];
      expect(err.code).toBe('SERVER_ERROR');
      expect(err.isRecoverableByModelFallback).toBe(false);
    });

    it('throws immediately on Network Dropout without attempting fallback', async () => {
      const mockFetch = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
      global.fetch = mockFetch;

      const errorCallback = vi.fn();
      await streamAnswer(
        'Explain heap sort',
        {
          type: 'groq',
          apiKey: 'gsk_valid_key',
          model: 'openai/gpt-oss-120b',
        },
        'java',
        {
          onError: errorCallback,
        }
      );

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(errorCallback).toHaveBeenCalled();
    });

    it('preserves original error details and attaches fallback diagnostics when all fallbacks fail', async () => {
      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => JSON.stringify({
            error: { code: 'model_decommissioned', message: 'Original model decommissioned' }
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => JSON.stringify({
            error: { code: 'model_not_found', message: 'Fallback model 1 not found' }
          }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => JSON.stringify({
            error: { code: 'model_not_found', message: 'Fallback model 2 not found' }
          }),
        });

      global.fetch = mockFetch;
      const errorCallback = vi.fn();

      await streamAnswer(
        'Explain DAG shortest path',
        {
          type: 'groq',
          apiKey: 'gsk_valid_key',
          model: 'openai/gpt-oss-120b',
        },
        'python',
        { onError: errorCallback }
      );

      expect(errorCallback).toHaveBeenCalled();
      const err = errorCallback.mock.calls[0][0];
      expect(err.code).toBe('MODEL_DECOMMISSIONED');
      expect(err.originalErrorDetail).toContain('Original model decommissioned');
      expect(Array.isArray(err.fallbackDiagnostics)).toBe(true);
      expect(err.fallbackDiagnostics.length).toBeGreaterThan(0);
    });

    it('handles mid-stream failure after token emission by rejecting and marking hasEmittedTokens', async () => {
      const encoder = new TextEncoder();
      let readCount = 0;

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: {
          getReader: () => ({
            read: async () => {
              readCount++;
              if (readCount === 1) {
                return {
                  done: false,
                  value: encoder.encode('data: {"choices":[{"delta":{"content":"Partial start"}}]}\n\n'),
                };
              }
              throw new Error('Socket abruptly disconnected mid-transfer');
            },
            releaseLock: () => {},
            cancel: async () => {},
          }),
        },
      });

      const errorCallback = vi.fn();
      const tokens: string[] = [];

      await streamAnswer(
        'Explain AVL trees',
        {
          type: 'groq',
          apiKey: 'gsk_valid_key',
          model: 'openai/gpt-oss-120b',
        },
        'typescript',
        {
          onToken: (t) => tokens.push(t),
          onError: errorCallback,
        }
      );

      expect(tokens.length).toBeGreaterThan(0);
      expect(tokens[0]).toContain('Partial start');
      expect(errorCallback).toHaveBeenCalled();
      const err = errorCallback.mock.calls[0][0];
      expect(err.hasEmittedTokens).toBe(true);
      expect(err.message).toContain('Stream interrupted after partial token emission');
      // Ensure no second fetch was attempted after mid-stream failure
      expect(global.fetch).toHaveBeenCalledTimes(1);
    });
  });

  // =========================================================================
  // 6. Streaming with GPT-OSS 120B and 20B
  // =========================================================================
  describe('Requirement 7: Streaming with GPT-OSS 120B and 20B', () => {
    it('streams tokens and sentences accurately with openai/gpt-oss-120b', async () => {
      const tokens: string[] = [];
      const sentences: string[] = [];

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: {
          getReader: () => {
            const chunks = [
              'data: {"choices":[{"delta":{"content":"GPT-OSS 120B handles "}}]}\n\n',
              'data: {"choices":[{"delta":{"content":"high-concurrency reasoning. "}}]}\n\n',
              'data: {"choices":[{"delta":{"content":"It streams answers in real time."}}]}\n\n',
              'data: [DONE]\n\n',
            ];
            let idx = 0;
            return {
              read: async () => {
                if (idx >= chunks.length) return { done: true, value: undefined };
                const c = chunks[idx++];
                return { done: false, value: new TextEncoder().encode(c) };
              },
              releaseLock: () => {},
              cancel: async () => {},
            };
          },
        },
      });

      await streamAnswer(
        'Tell me about GPT-OSS 120B',
        {
          type: 'groq',
          apiKey: 'gsk_valid_key',
          model: 'openai/gpt-oss-120b',
        },
        'java',
        {
          onToken: (tok) => tokens.push(tok),
          onSentence: (sent) => sentences.push(sent),
        }
      );

      expect(tokens.join('')).toContain('high-concurrency reasoning');
      expect(sentences.length).toBeGreaterThan(0);
    });

    it('streams tokens accurately with openai/gpt-oss-20b', async () => {
      let full = '';

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        body: {
          getReader: () => {
            const chunks = [
              'data: {"choices":[{"delta":{"content":"GPT-OSS 20B is "}}]}\n\n',
              'data: {"choices":[{"delta":{"content":"ultra-fast for low-latency coding."}}]}\n\n',
              'data: [DONE]\n\n',
            ];
            let idx = 0;
            return {
              read: async () => {
                if (idx >= chunks.length) return { done: true, value: undefined };
                const c = chunks[idx++];
                return { done: false, value: new TextEncoder().encode(c) };
              },
              releaseLock: () => {},
              cancel: async () => {},
            };
          },
        },
      });

      await streamAnswer(
        'Tell me about GPT-OSS 20B',
        {
          type: 'groq',
          apiKey: 'gsk_valid_key',
          model: 'openai/gpt-oss-20b',
        },
        'javascript',
        {
          onComplete: (completed) => {
            full = completed;
          },
        }
      );

      expect(full).toBe('GPT-OSS 20B is ultra-fast for low-latency coding.');
    });
  });

  // =========================================================================
  // 7. Audio Transcription Independently from Answer Generation
  // =========================================================================
  describe('Requirement 7: Audio Transcription Decoupled from LLM Generation', () => {
    it('transcribes audio using whisper-large-v3-turbo independently from LLM model configuration', async () => {
      const mockFetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          text: 'Can you explain the difference between optimistic and pessimistic locking?',
          language: 'en',
          duration: 3.2,
          segments: [{ start: 0, end: 3.2, text: 'Can you explain the difference between optimistic and pessimistic locking?' }],
        }),
      });
      global.fetch = mockFetch;

      const dummyAudio = createValidWavBlob();
      const result = await transcribeAudio(dummyAudio, {
        provider: 'groq',
        apiKey: 'gsk_valid_whisper_key',
        model: 'whisper-large-v3-turbo',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      const callArgs = mockFetch.mock.calls[0];
      expect(callArgs[0]).toBe('https://api.groq.com/openai/v1/audio/transcriptions');
      expect(result.text).toContain('optimistic and pessimistic locking');
    });
  });

  // =========================================================================
  // 8. Model Preflight Validation (Active Completion Probe)
  // =========================================================================
  describe('Requirement 5: Model Preflight Validation with Active Completion Probe', () => {
    it('validates provider credentials format strictly', async () => {
      const noKey = await validateModelPreflight('groq', 'openai/gpt-oss-120b', '');
      expect(noKey.valid).toBe(false);
      expect(noKey.code).toBe('AUTH_INVALID_KEY');

      const badFormat = await validateModelPreflight('groq', 'openai/gpt-oss-120b', 'bad_prefix_key');
      expect(badFormat.valid).toBe(false);
      expect(badFormat.code).toBe('AUTH_INVALID_KEY');
    });

    it('executes active 1-token completion probe and reports valid: true with latency', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          id: 'chatcmpl-probe-123',
          choices: [{ message: { role: 'assistant', content: 'pong' } }],
        }),
      });

      const check = await validateModelPreflight(
        'groq',
        'openai/gpt-oss-120b',
        'gsk_valid_key_123456789012'
      );

      expect(check.valid).toBe(true);
      expect(typeof check.latencyMs).toBe('number');
      expect(global.fetch).toHaveBeenCalledTimes(1);
      const call = (global.fetch as any).mock.calls[0];
      expect(call[0]).toBe('https://api.groq.com/openai/v1/chat/completions');
      const body = JSON.parse(call[1].body);
      expect(body.model).toBe('openai/gpt-oss-120b');
      expect(body.max_tokens).toBe(1);
    });

    it('distinguishes 401 Authentication Failure in preflight completion probe', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        json: async () => ({ error: { message: 'Invalid API Key provided: gsk_abcdef1234567890123456' } }),
      });

      const check = await validateModelPreflight(
        'groq',
        'openai/gpt-oss-120b',
        'gsk_invalid_key_123456789012'
      );

      expect(check.valid).toBe(false);
      expect(check.code).toBe('AUTH_INVALID_KEY');
      expect(check.message).not.toContain('gsk_abcdef1234567890123456');
      expect(check.message).toContain('gsk_[REDACTED_GROQ_KEY]');
    });

    it('distinguishes 403 Forbidden in preflight completion probe', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 403,
        statusText: 'Forbidden',
        json: async () => ({ error: { message: 'Organization access restricted' } }),
      });

      const check = await validateModelPreflight(
        'groq',
        'openai/gpt-oss-120b',
        'gsk_valid_key_123456789012'
      );

      expect(check.valid).toBe(false);
      expect(check.code).toBe('AUTH_FORBIDDEN');
    });

    it('distinguishes 402 Billing / Payment Required in preflight completion probe', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 402,
        statusText: 'Payment Required',
        json: async () => ({ error: { message: 'Account credit balance exhausted' } }),
      });

      const check = await validateModelPreflight(
        'groq',
        'openai/gpt-oss-120b',
        'gsk_valid_key_123456789012'
      );

      expect(check.valid).toBe(false);
      expect(check.code).toBe('BILLING_PAYMENT_REQUIRED');
    });

    it('distinguishes 429 Rate Limiting in preflight completion probe', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 429,
        statusText: 'Too Many Requests',
        json: async () => ({ error: { message: 'TPM or RPM rate limit reached' } }),
      });

      const check = await validateModelPreflight(
        'groq',
        'openai/gpt-oss-120b',
        'gsk_valid_key_123456789012'
      );

      expect(check.valid).toBe(false);
      expect(check.code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('distinguishes Model Not Found / Decommissioned in preflight probe', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        json: async () => ({
          error: {
            code: 'model_decommissioned',
            message: "The model 'llama-3.1-70b-versatile' has been decommissioned.",
          },
        }),
      });

      const check = await validateModelPreflight(
        'groq',
        'llama-3.1-70b-versatile',
        'gsk_valid_key_123456789012'
      );

      expect(check.valid).toBe(false);
      expect(check.code).toBe('MODEL_DECOMMISSIONED');
    });

    it('distinguishes Generic 404 Endpoint Not Found in preflight probe', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        text: async () => '<html>404 Not Found: Cannot POST /openai/v1/wrong_route</html>',
      });

      const check = await validateModelPreflight(
        'groq',
        'openai/gpt-oss-120b',
        'gsk_valid_key_123456789012'
      );

      expect(check.valid).toBe(false);
      expect(check.code).toBe('ENDPOINT_NOT_FOUND');
    });

    it('distinguishes model-list availability from transcription capability in STT preflight', async () => {
      // 1. Routine preflight: checks model catalog only without sending any audio
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: 'whisper-large-v3-turbo' }, { id: 'whisper-large-v3' }],
        }),
      });

      const routineCheck = await validateModelPreflight(
        'groq',
        'whisper-large-v3-turbo',
        'gsk_valid_key_123456789012'
      );

      expect(routineCheck.valid).toBe(true);
      expect(routineCheck.modelListAvailable).toBe(true);
      expect(routineCheck.transcriptionCapable).toBeUndefined();
      expect(global.fetch).toHaveBeenCalledTimes(1);
      expect((global.fetch as any).mock.calls[0][0]).toBe('https://api.groq.com/openai/v1/models');

      // 2. Deep transcription probe: executes active probe using synthetic WAV fixture (never user recordings)
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ data: [{ id: 'whisper-large-v3-turbo' }] }),
        })
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ text: 'Preflight probe verified' }),
        });

      const deepCheck = await validateModelPreflight(
        'groq',
        'whisper-large-v3-turbo',
        'gsk_valid_key_123456789012',
        undefined,
        { probeTranscription: true }
      );

      expect(deepCheck.valid).toBe(true);
      expect(deepCheck.modelListAvailable).toBe(true);
      expect(deepCheck.transcriptionCapable).toBe(true);
      expect(global.fetch).toHaveBeenCalledTimes(2);
      expect((global.fetch as any).mock.calls[1][0]).toBe(
        'https://api.groq.com/openai/v1/audio/transcriptions'
      );
    });

    it('reports transcriptionCapable: false when audio probe fails without triggering LLM fallback', async () => {
      global.fetch = vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          status: 200,
          json: async () => ({ data: [{ id: 'whisper-large-v3-turbo' }] }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
          json: async () => ({ error: { message: 'Audio processing node crashed' } }),
        });

      const failedProbe = await validateModelPreflight(
        'groq',
        'whisper-large-v3-turbo',
        'gsk_valid_key_123456789012',
        undefined,
        { probeTranscription: true }
      );

      expect(failedProbe.valid).toBe(false);
      expect(failedProbe.modelListAvailable).toBe(true);
      expect(failedProbe.transcriptionCapable).toBe(false);
      expect(failedProbe.code).toBe('SERVER_ERROR');
    });
  });

  // =========================================================================
  // 9. Credential Sanitization & Diagnostic Privacy
  // =========================================================================
  describe('Requirement 6: Credential Sanitization & Diagnostic Privacy', () => {
    it('redacts Groq and OpenAI API keys from diagnostic and error strings', () => {
      const rawText =
        'Error occurred calling https://api.groq.com with gsk_abcdef123456789012345678 and Bearer sk-xyz123456789012345678';
      const clean = sanitizeDiagnosticSecret(rawText);

      expect(clean).not.toContain('gsk_abcdef123456789012345678');
      expect(clean).not.toContain('sk-xyz123456789012345678');
      expect(clean).toContain('gsk_[REDACTED_GROQ_KEY]');
      expect(clean).toContain('Bearer [REDACTED_TOKEN]');
    });

    it('redacts nested authorization headers, JSON objects, and bearer tokens in diagnostics', () => {
      const nestedPayload = {
        headers: {
          authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.sensitive_payload.signature',
          'x-api-key': 'gsk_nested_secret_1234567890abcdef',
        },
        error: {
          message: 'Failed request with token Bearer sk-proj-1234567890abcdef1234567890',
          apiKey: 'sk-abcdef1234567890abcdef123456',
        },
      };

      const sanitized = sanitizeDiagnosticSecret(nestedPayload);
      expect(sanitized).not.toContain('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9');
      expect(sanitized).not.toContain('gsk_nested_secret_1234567890abcdef');
      expect(sanitized).not.toContain('sk-proj-1234567890abcdef1234567890');
      expect(sanitized).not.toContain('sk-abcdef1234567890abcdef123456');
      expect(sanitized).toContain('[REDACTED');
    });

    it('enforces structured allowlisting via createSafeDiagnosticRecord without leaking request/candidate data', () => {
      const safeRecord = createSafeDiagnosticRecord(
        'groq',
        'openai/gpt-oss-120b',
        'openai/gpt-oss-20b',
        'MODEL_NOT_FOUND',
        404,
        'Original model failed: gsk_secret_12345678901234567890 with Bearer tok_123',
        false
      );

      // Verify only allowlisted properties exist
      const keys = Object.keys(safeRecord);
      expect(keys).toEqual(['timestamp', 'provider', 'originalModel', 'fallbackModel', 'triggerError', 'successful']);
      expect(safeRecord.triggerError.message).not.toContain('gsk_secret_12345678901234567890');
      expect(safeRecord.triggerError.message).not.toContain('tok_123');
      expect(safeRecord.triggerError.message).toContain('gsk_[REDACTED_GROQ_KEY]');
      expect(safeRecord.triggerError.message).toContain('Bearer [REDACTED_TOKEN]');

      // Ensure no candidate question or body property was attached
      expect((safeRecord as any).requestBody).toBeUndefined();
      expect((safeRecord as any).candidateAnswer).toBeUndefined();
      expect((safeRecord as any).headers).toBeUndefined();
    });
  });
});
