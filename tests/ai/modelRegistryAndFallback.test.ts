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
  // 8. Model Preflight Validation
  // =========================================================================
  describe('Requirement 5: Model Preflight Validation', () => {
    it('validates provider credentials format strictly', async () => {
      const noKey = await validateModelPreflight('groq', 'openai/gpt-oss-120b', '');
      expect(noKey.valid).toBe(false);
      expect(noKey.code).toBe('AUTH_INVALID_KEY');

      const badFormat = await validateModelPreflight('groq', 'openai/gpt-oss-120b', 'bad_prefix_key');
      expect(badFormat.valid).toBe(false);
      expect(badFormat.code).toBe('AUTH_INVALID_KEY');
    });

    it('reports model-not-found separately from authentication errors during preflight', async () => {
      // Mock models endpoint returning 200 with list of active models
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: 'openai/gpt-oss-120b' }, { id: 'openai/gpt-oss-20b' }],
        }),
      });

      const check = await validateModelPreflight(
        'groq',
        'llama-3.3-70b-versatile',
        'gsk_valid_key_123456789012'
      );

      expect(check.valid).toBe(false);
      expect(check.code).toBe('MODEL_NOT_FOUND');
      expect(check.message).toContain("Model 'llama-3.3-70b-versatile' is not available");
    });

    it('passes preflight when key is valid and model is in account model list', async () => {
      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          data: [{ id: 'openai/gpt-oss-120b' }, { id: 'openai/gpt-oss-20b' }],
        }),
      });

      const check = await validateModelPreflight(
        'groq',
        'openai/gpt-oss-120b',
        'gsk_valid_key_123456789012'
      );

      expect(check.valid).toBe(true);
      expect(check.availableModels).toContain('openai/gpt-oss-120b');
    });
  });

  // =========================================================================
  // 9. Credential Sanitization
  // =========================================================================
  describe('Requirement 6: Credential Sanitization in Error Logs & Diagnostics', () => {
    it('redacts Groq and OpenAI API keys from diagnostic and error strings', () => {
      const rawText =
        'Error occurred calling https://api.groq.com with gsk_abcdef123456789012345678 and Bearer sk-xyz123456789012345678';
      const clean = sanitizeDiagnosticSecret(rawText);

      expect(clean).not.toContain('gsk_abcdef123456789012345678');
      expect(clean).not.toContain('sk-xyz123456789012345678');
      expect(clean).toContain('gsk_[REDACTED_GROQ_KEY]');
      expect(clean).toContain('Bearer [REDACTED_TOKEN]');
    });
  });
});
