import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  KnowledgeVaultService,
  createInitialVault,
} from '../src/services/knowledgeVault/knowledgeVaultService';

describe('KnowledgeVaultService encrypted persistence', () => {
  let records: Map<string, string>;
  let localStorage: {
    getItem: ReturnType<typeof vi.fn>;
    setItem: ReturnType<typeof vi.fn>;
    removeItem: ReturnType<typeof vi.fn>;
  };
  let secureRecordSet: ReturnType<typeof vi.fn>;
  let secureRecordGet: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    records = new Map();
    localStorage = {
      getItem: vi.fn(() => null),
      setItem: vi.fn(),
      removeItem: vi.fn(),
    };
    secureRecordSet = vi.fn(async (_namespace: string, id: string, data: string) => {
      records.set(id, data);
      return true;
    });
    secureRecordGet = vi.fn(async (_namespace: string, id: string) => records.get(id) ?? null);
    vi.stubGlobal('window', {
      localStorage,
      electronAPI: { secureRecordSet, secureRecordGet },
    });
  });

  it('persists vault updates to encrypted storage and never writes plaintext localStorage', async () => {
    const service = KnowledgeVaultService.getInstance();
    const updated = {
      ...createInitialVault(),
      profile: { ...createInitialVault().profile, email: 'candidate@example.test' },
    };

    service.saveVault(updated);

    await expect(service.flushPersistence()).resolves.toBe(true);
    expect(records.get('candidate_knowledge_vault_v2')).toContain('candidate@example.test');
    expect(secureRecordSet).toHaveBeenCalledWith(
      'knowledge-vault',
      'candidate_knowledge_vault_v2',
      expect.any(String)
    );
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('stores an encrypted empty-vault tombstone on reset without deleting the legacy source', async () => {
    const legacy = '{"schemaVersion":2,"profile":{"email":"legacy@example.test"}}';
    localStorage.getItem.mockReturnValue(legacy);
    const service = KnowledgeVaultService.getInstance();

    service.resetVault();

    await expect(service.flushPersistence()).resolves.toBe(true);
    expect(localStorage.removeItem).not.toHaveBeenCalled();
    const saved = JSON.parse(records.get('candidate_knowledge_vault_v2') || '{}');
    expect(saved.profile.email).toBe('');
  });

  it('reports encrypted persistence failure instead of claiming a durable save', async () => {
    secureRecordSet.mockResolvedValue(false);
    const service = KnowledgeVaultService.getInstance();

    service.saveVault(createInitialVault());

    await expect(service.flushPersistence()).resolves.toBe(false);
    expect(service.getPersistenceStatus().state).toBe('error');
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });

  it('fails closed when Electron encrypted storage is unavailable', async () => {
    vi.stubGlobal('window', { localStorage });
    const service = KnowledgeVaultService.getInstance();

    service.saveVault(createInitialVault());

    await expect(service.flushPersistence()).resolves.toBe(false);
    expect(service.getPersistenceStatus().state).toBe('unavailable');
    expect(localStorage.setItem).not.toHaveBeenCalled();
  });
});
