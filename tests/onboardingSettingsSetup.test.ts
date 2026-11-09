import { describe, expect, it, vi } from 'vitest';
import { persistOnboardingSettings } from '../src/services/onboarding/settingsSetup';

describe('onboarding settings persistence', () => {
  it('persists settings sequentially in the supplied order', async () => {
    const writer = vi.fn().mockResolvedValue(true);
    await expect(
      persistOnboardingSettings(
        [
          ['aiProvider', 'groq'],
          ['aiModel', 'openai/gpt-oss-120b'],
          ['whisperModel', 'whisper-large-v3-turbo'],
          ['hasCompletedOnboarding', true],
        ],
        writer
      )
    ).resolves.toBeUndefined();

    expect(writer.mock.calls).toEqual([
      ['aiProvider', 'groq'],
      ['aiModel', 'openai/gpt-oss-120b'],
      ['whisperModel', 'whisper-large-v3-turbo'],
      ['hasCompletedOnboarding', true],
    ]);
  });

  it('rejects when settings storage is unavailable', async () => {
    await expect(
      persistOnboardingSettings([['aiProvider', 'groq']])
    ).rejects.toThrow('Settings storage is unavailable');
  });

  it('stops before marking onboarding complete when an earlier setting fails', async () => {
    const writer = vi
      .fn()
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(false);

    await expect(
      persistOnboardingSettings(
        [
          ['aiProvider', 'groq'],
          ['aiModel', 'model-id'],
          ['hasCompletedOnboarding', true],
        ],
        writer
      )
    ).rejects.toThrow('aiModel');

    expect(writer).toHaveBeenCalledTimes(2);
    expect(writer).not.toHaveBeenCalledWith('hasCompletedOnboarding', true);
  });

  it('propagates IPC write errors instead of hiding persistence failures', async () => {
    const writer = vi.fn().mockRejectedValue(new Error('Storage permission denied'));
    await expect(
      persistOnboardingSettings([['aiProvider', 'groq']], writer)
    ).rejects.toThrow('Storage permission denied');
  });
});
