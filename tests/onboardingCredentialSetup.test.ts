import { describe, expect, it, vi } from 'vitest';
import {
  deleteStoredCredential,
  persistCredential,
  persistOnboardingCredential,
} from '../src/services/onboarding/credentialSetup';

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
  it('trims a supplied key and requires a successful secure write', async () => {
    const writer = vi.fn().mockResolvedValue(true);
    await expect(persistCredential('openai', '  sk-secret  ', writer)).resolves.toBeUndefined();
    expect(writer).toHaveBeenCalledWith('openai', 'sk-secret');
  });

  it('rejects empty keys and missing or unsuccessful writers in Settings', async () => {
    const writer = vi.fn().mockResolvedValue(false);
    await expect(persistCredential('openai', '   ', writer)).rejects.toThrow(
      'API key must not be empty'
    );
    await expect(persistCredential('openai', 'sk-secret')).rejects.toThrow(
      'Secure credential storage is unavailable'
    );
    await expect(persistCredential('openai', 'sk-secret', writer)).rejects.toThrow(
      'could not be saved'
    );
    expect(writer).toHaveBeenCalledOnce();
  });

  it('requires a working delete method and a successful deletion result', async () => {
    const deleter = vi.fn().mockResolvedValue(true);
    await expect(deleteStoredCredential('groq-secondary', deleter)).resolves.toBeUndefined();
    expect(deleter).toHaveBeenCalledWith('groq-secondary');

    await expect(deleteStoredCredential('groq-secondary')).rejects.toThrow(
      'was not deleted'
    );
    await expect(
      deleteStoredCredential('groq-secondary', vi.fn().mockResolvedValue(false))
    ).rejects.toThrow('could not be deleted');
  });

  it('propagates credential deletion IPC errors', async () => {
    const deleter = vi.fn().mockRejectedValue(new Error('IPC unavailable'));
    await expect(deleteStoredCredential('groq-secondary', deleter)).rejects.toThrow(
      'IPC unavailable'
    );
  });

});
