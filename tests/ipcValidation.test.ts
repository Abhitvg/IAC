import { describe, it, expect, vi } from 'vitest';

// Mock electron dependencies before importing handlers
vi.mock('electron', () => ({
  ipcMain: {
    handle: vi.fn(),
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

import { validateSetting } from '../electron/ipc/handlers';

describe('IPC Settings Validation', () => {
  it('allows valid setting keys and values', () => {
    expect(() => validateSetting('responseMode', 'quiz')).not.toThrow();
    expect(() => validateSetting('aiProvider', 'groq')).not.toThrow();
    expect(() => validateSetting('aiProvider', 'openai')).not.toThrow();
    expect(() => validateSetting('aiProvider', 'openrouter')).not.toThrow();
    expect(() => validateSetting('aiProvider', 'ollama')).not.toThrow();

    expect(() => validateSetting('temperature', 0.7)).not.toThrow();
    expect(() => validateSetting('maxTokens', 2048)).not.toThrow();
    expect(() => validateSetting('browserIntegration', true)).not.toThrow();
    expect(() => validateSetting('alwaysOnTop', false)).not.toThrow();
    expect(() => validateSetting('hasCompletedOnboarding', true)).not.toThrow();
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
