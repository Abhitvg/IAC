import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CanonicalProfileService } from '../src/services/knowledgeVault/canonicalProfileService';
import { createDefaultCanonicalProfile } from '../src/services/knowledgeVault/canonicalProfile';

const STORAGE_KEY = 'iac_canonical_candidate_profile_v2';

describe('Canonical candidate profile encrypted persistence', () => {
  let encryptedValue: string | null;
  let secureApi: {
    securePersistenceGet: ReturnType<typeof vi.fn>;
    securePersistenceSet: ReturnType<typeof vi.fn>;
    securePersistenceRemove: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    localStorage.clear();
    encryptedValue = null;
    secureApi = {
      securePersistenceGet: vi.fn(async () => encryptedValue),
      securePersistenceSet: vi.fn(async (_namespace: string, value: string) => {
        encryptedValue = value;
        return true;
      }),
      securePersistenceRemove: vi.fn(async () => {
        encryptedValue = null;
        return true;
      }),
    };
    Object.defineProperty(window, 'electronAPI', {
      configurable: true,
      value: secureApi,
    });
    (CanonicalProfileService as any).instance = null;
  });

  afterEach(() => {
    localStorage.clear();
    delete (window as any).electronAPI;
    (CanonicalProfileService as any).instance = null;
    vi.restoreAllMocks();
  });

  it('migrates legacy plaintext only after encrypted write and read-back verification', async () => {
    const profile = createDefaultCanonicalProfile();
    profile.identity.fullName = 'Candidate Profile Test';
    const legacy = JSON.stringify(profile);
    localStorage.setItem(STORAGE_KEY, legacy);

    secureApi.securePersistenceSet.mockImplementationOnce(async (_namespace, value) => {
      expect(localStorage.getItem(STORAGE_KEY)).toBe(legacy);
      encryptedValue = value;
      return true;
    });

    const service = CanonicalProfileService.getInstance();
    await expect(service.ready()).resolves.toBe(true);

    expect(encryptedValue).toBe(legacy);
    expect(secureApi.securePersistenceGet).toHaveBeenCalledTimes(2);
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
    expect(service.getProfile().identity.fullName).toBe('Candidate Profile Test');
  });

  it(
    'preserves plaintext and refuses to fall back when an encrypted record cannot be decrypted',
    async () => {
      const profile = createDefaultCanonicalProfile();
      profile.identity.fullName = 'Legacy Candidate';
      const legacy = JSON.stringify(profile);
      localStorage.setItem(STORAGE_KEY, legacy);
      secureApi.securePersistenceGet.mockRejectedValueOnce(new Error('OS keyring is locked'));

      const service = CanonicalProfileService.getInstance();
      await expect(service.ready()).resolves.toBe(false);

      expect(localStorage.getItem(STORAGE_KEY)).toBe(legacy);
      expect(service.getProfile().identity.fullName).toBe('');
      expect(service.getPersistenceError()).toContain('OS keyring is locked');
    }
  );

  it('does not silently fall back to plaintext when encrypted content is corrupt', async () => {
    const profile = createDefaultCanonicalProfile();
    profile.identity.fullName = 'Do Not Load This Plaintext';
    const legacy = JSON.stringify(profile);
    localStorage.setItem(STORAGE_KEY, legacy);
    encryptedValue = '{invalid-json';

    const service = CanonicalProfileService.getInstance();
    await expect(service.ready()).resolves.toBe(false);

    expect(localStorage.getItem(STORAGE_KEY)).toBe(legacy);
    expect(service.getProfile().identity.fullName).toBe('');
    expect(service.getPersistenceError()).toContain('JSON');
  });

  it('writes profile updates through encrypted storage and verifies the committed value', async () => {
    const service = CanonicalProfileService.getInstance();
    await expect(service.ready()).resolves.toBe(true);

    const next = {
      ...service.getProfile(),
      identity: { ...service.getProfile().identity, fullName: 'Encrypted Candidate' },
    };
    expect(service.saveProfile(next)).toBe(true);
    await expect(service.flushPendingPersistence()).resolves.toBe(true);

    expect(encryptedValue).toContain('Encrypted Candidate');
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('does not claim a save succeeded when the encrypted store rejects the write', async () => {
    const service = CanonicalProfileService.getInstance();
    await expect(service.ready()).resolves.toBe(true);
    secureApi.securePersistenceSet.mockRejectedValueOnce(new Error('keyring unavailable'));

    const next = {
      ...service.getProfile(),
      identity: { ...service.getProfile().identity, fullName: 'Unsaved Candidate' },
    };
    service.saveProfile(next);
    await expect(service.flushPendingPersistence()).resolves.toBe(false);
    expect(service.getPersistenceError()).toContain('keyring unavailable');
  });
});
