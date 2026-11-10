import { describe, it, expect, vi } from 'vitest';

// Mock electron dependencies before importing handlers
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
  },
  clipboard: {
    writeText: vi.fn(),
  },
  BrowserWindow: vi.fn(),
  safeStorage: {
    isEncryptionAvailable: () => false,
  },
  app: {
    getPath: () => '/tmp',
  },
}));

vi.mock('electron-store', () => {
  return {
    default: class MockStore {
      store: any = {};
      get(k: string, d?: any) {
        return this.store[k] ?? d;
      }
      set(k: string, v: any) {
        this.store[k] = v;
      }
    },
  };
});

import {
  validateCloudPreflightRequest,
  validateCloudTranscriptionRequest,
  validateSetting,
  shouldReleaseCloudLLMController,
} from '../electron/ipc/handlers';

describe('Cloud LLM controller lifecycle', () => {
  it('releases controllers for non-streaming requests and failed responses', () => {
    expect(shouldReleaseCloudLLMController({ stream: false }, { ok: true })).toBe(true);
    expect(shouldReleaseCloudLLMController({ stream: true }, { ok: false })).toBe(true);
    expect(shouldReleaseCloudLLMController({ stream: true }, { ok: true })).toBe(false);
  });
});

describe('IPC Settings Validation', () => {
  it('accepts only bounded cloud-provider preflight requests', () => {
    expect(
      validateCloudPreflightRequest({ provider: 'groq', model: 'llama-3.3-70b-versatile' })
    ).toBe(true);
    expect(validateCloudPreflightRequest({ provider: 'openai', model: 'gpt-4o-mini' })).toBe(true);
    expect(validateCloudPreflightRequest({ provider: 'ollama', model: 'llama3:8b' })).toBe(false);
    expect(validateCloudPreflightRequest({ provider: 'openai', model: '' })).toBe(false);
    expect(validateCloudPreflightRequest({ provider: 'openrouter', model: 'x'.repeat(161) })).toBe(
      false
    );
    expect(validateCloudPreflightRequest(null)).toBe(false);
  });

  it('validates bounded cloud transcription IPC requests against supported provider models', () => {
    const request = {
      requestId: 'stt-request-123',
      provider: 'groq',
      model: 'whisper-large-v3-turbo',
      audio: new Uint8Array(1024),
      language: 'en',
      prompt: 'technical interview',
    };

    expect(validateCloudTranscriptionRequest(request)).toBe(true);
    expect(validateCloudTranscriptionRequest({ ...request, model: 'arbitrary-model' })).toBe(false);
    expect(validateCloudTranscriptionRequest({ ...request, requestId: '../invalid' })).toBe(false);
    expect(validateCloudTranscriptionRequest({ ...request, audio: new Uint8Array(100) })).toBe(
      false
    );
    expect(
      validateCloudTranscriptionRequest({ ...request, audio: new Uint8Array(26 * 1024 * 1024) })
    ).toBe(false);
    expect(
      validateCloudTranscriptionRequest({
        ...request,
        provider: 'openai',
        model: 'whisper-1',
      })
    ).toBe(true);
    expect(validateCloudTranscriptionRequest(null)).toBe(false);
  });

  it('allows valid setting keys and values', () => {
    expect(() => validateSetting('responseMode', 'interview')).not.toThrow();
    expect(() => validateSetting('responseMode', 'coding')).not.toThrow();
    expect(() => validateSetting('responseMode', 'quiz')).toThrow('Invalid responseMode');
    expect(() => validateSetting('aiProvider', 'groq')).not.toThrow();
    expect(() => validateSetting('aiProvider', 'openai')).not.toThrow();
    expect(() => validateSetting('aiProvider', 'openrouter')).not.toThrow();
    expect(() => validateSetting('aiProvider', 'ollama')).not.toThrow();

    expect(() => validateSetting('temperature', 0.7)).not.toThrow();
    expect(() => validateSetting('maxTokens', 2048)).not.toThrow();
    expect(() => validateSetting('browserIntegration', true)).not.toThrow();
    expect(() => validateSetting('alwaysOnTop', false)).not.toThrow();
    expect(() => validateSetting('hasCompletedOnboarding', true)).not.toThrow();
    expect(() => validateSetting('windowOpacity', 0.25)).not.toThrow();
    expect(() => validateSetting('windowOpacity', 0.88)).not.toThrow();
  });

  it('validates every persisted setting shape and rejects malformed values', () => {
    expect(() => validateSetting('preferredLanguage', 'typescript')).not.toThrow();
    expect(() => validateSetting('preferredLanguage', 'ruby')).toThrow('Invalid preferredLanguage');
    expect(() => validateSetting('theme', 'light')).not.toThrow();
    expect(() => validateSetting('theme', 'system')).toThrow('Invalid theme');
    expect(() => validateSetting('audioFormat', 'wav')).not.toThrow();
    expect(() => validateSetting('audioFormat', 'mp3')).toThrow('Invalid audioFormat');
    expect(() => validateSetting('teleprompterFontSize', 'xlarge')).not.toThrow();
    expect(() => validateSetting('teleprompterFontSize', 'giant')).toThrow();
    expect(() => validateSetting('aiModel', 'openai/gpt-oss-120b')).not.toThrow();
    expect(() => validateSetting('aiModel', '../secret')).toThrow();
    expect(() => validateSetting('systemPrompt', 'interviewer')).not.toThrow();
    expect(() => validateSetting('systemPrompt', 'x'.repeat(20_001))).toThrow();
    expect(() => validateSetting('maxTokens', 50.5)).toThrow('Invalid maxTokens');

    const shortcuts = {
      record: 'R', analyze: 'A', copyAnswer: 'C', quickAnswer: 'Q',
      detailedAnswer: 'D', minimize: 'Escape', regenerate: 'CommandOrControl+Enter',
    };
    expect(() => validateSetting('shortcuts', shortcuts)).not.toThrow();
    expect(() => validateSetting('shortcuts', { ...shortcuts, extra: 'X' })).toThrow('shortcuts');
    expect(() => validateSetting('shortcuts', { ...shortcuts, record: 42 })).toThrow('shortcuts');

    const notice = {
      timestamp: Date.now(), previousModel: 'legacy-model',
      newModel: 'replacement-model', reason: 'Model retired', dismissed: false,
    };
    expect(() => validateSetting('lastModelMigrationNotice', notice)).not.toThrow();
    expect(() => validateSetting('lastModelMigrationNotice', { ...notice, timestamp: 'yesterday' }))
      .toThrow('invalid shape');
    expect(() => validateSetting('customApiEndpoint', 'http://localhost:11434')).not.toThrow();
    expect(() => validateSetting('customApiEndpoint', { url: 'http://localhost' })).toThrow();
  });

  it('does not allow the renderer to set the main-process extension token', () => {
    expect(() => validateSetting('extensionToken', 'renderer-controlled-token')).toThrow(
      'Unauthorized setting key'
    );
  });

  it('rejects unauthorized setting keys to prevent prototype pollution or arbitrary storage', () => {
    expect(() => validateSetting('__proto__', {})).toThrow('Unauthorized setting key');
    expect(() => validateSetting('isAdmin', true)).toThrow('Unauthorized setting key');
    expect(() => validateSetting('customArbitraryField', 'value')).toThrow(
      'Unauthorized setting key'
    );
  });

  it('validates provider options strictly', () => {
    expect(() => validateSetting('aiProvider', 'claude_fake')).toThrow('Invalid aiProvider');
    expect(() => validateSetting('aiProvider', 'groqqq')).toThrow('Invalid aiProvider');
  });

  it('validates temperature range strictly [0, 2]', () => {
    expect(() => validateSetting('temperature', -0.1)).toThrow('Invalid temperature');
    expect(() => validateSetting('temperature', 2.5)).toThrow('Invalid temperature');
    expect(() => validateSetting('windowOpacity', 0.05)).toThrow('Invalid windowOpacity');
    expect(() => validateSetting('windowOpacity', 1.5)).toThrow('Invalid windowOpacity');
    expect(() => validateSetting('windowOpacity', '0.5' as any)).toThrow('Invalid windowOpacity');
    expect(() => validateSetting('temperature', '0.7' as any)).toThrow('Invalid temperature');
  });

  it('validates maxTokens range strictly [50, 8192]', () => {
    expect(() => validateSetting('maxTokens', 10)).toThrow('Invalid maxTokens');
    expect(() => validateSetting('maxTokens', 10000)).toThrow('Invalid maxTokens');
    expect(() => validateSetting('maxTokens', '2048' as any)).toThrow('Invalid maxTokens');
  });

  it('validates boolean settings types strictly', () => {
    expect(() => validateSetting('alwaysOnTop', 'true' as any)).toThrow();
    expect(() => validateSetting('browserIntegration', 1 as any)).toThrow();
  });
});
