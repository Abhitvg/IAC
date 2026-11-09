import { describe, expect, it, vi } from 'vitest';
import { persistOnboardingCredential } from '../src/services/onboarding/credentialSetup';

describe('onboarding credential persistence', () => {
  it('allows an intentionally blank key so setup can be completed later', async () => {
    const writer = vi.fn();
    await expect(persistOnboardingCredential('groq', '  ', writer)).resolves.toBeUndefined();
    expect(writer).not.toHaveBeenCalled();
  });

  it('requires a credential writer when a key is supplied', async () => {
    await expect(persistOnboardingCredential('groq', 'gsk_test')).rejects.toThrow(
      'Secure credential storage is unavailable'
    );
  });

  it('rejects when the credential store does not confirm persistence', async () => {
    const writer = vi.fn().mockResolvedValue(false);
    await expect(persistOnboardingCredential('groq', '  gsk_test  ', writer)).rejects.toThrow(
      'could not be saved'
    );
    expect(writer).toHaveBeenCalledWith('groq', 'gsk_test');
  });

  it('resolves only after the credential store confirms persistence', async () => {
    const writer = vi.fn().mockResolvedValue(true);
    await expect(
      persistOnboardingCredential('openrouter', 'sk_test', writer)
    ).resolves.toBeUndefined();
    expect(writer).toHaveBeenCalledWith('openrouter', 'sk_test');
  });

  it('propagates credential store errors without swallowing them', async () => {
    const writer = vi.fn().mockRejectedValue(new Error('Encryption unavailable'));
    await expect(persistOnboardingCredential('groq', 'gsk_test', writer)).rejects.toThrow(
      'Encryption unavailable'
    );
  });
});
