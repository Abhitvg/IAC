import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  KNOWLEDGE_VAULT_ENCRYPTED_RECORD_ID,
  KNOWLEDGE_VAULT_LEGACY_STORAGE_KEY,
  KNOWLEDGE_VAULT_MIGRATION_JOURNAL_ID,
  KNOWLEDGE_VAULT_MAX_RECORD_BYTES,
  migrateKnowledgeVaultToEncryptedStorage,
  previewKnowledgeVaultMigration,
} from '../src/services/knowledgeVault/KnowledgeVaultDataMigration';

function createStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    removeItem: vi.fn((key: string) => values.delete(key)),
    values,
  };
}

afterEach(() => vi.unstubAllGlobals());

describe('Knowledge Vault encrypted migration', () => {
  it('previews the legacy vault without mutating localStorage', () => {
    const source = '{"schemaVersion":2,"profile":{"email":"private@example.test"}}';
    const localStorage = createStorage({ [KNOWLEDGE_VAULT_LEGACY_STORAGE_KEY]: source });
    vi.stubGlobal('window', {
      localStorage,
      electronAPI: {
        secureRecordGet: vi.fn(),
        secureRecordSet: vi.fn(),
      },
    });

    const preview = previewKnowledgeVaultMigration();

    expect(preview.available).toBe(true);
    expect(preview.recordPresent).toBe(true);
    expect(preview.bytes).toBe(new TextEncoder().encode(source).byteLength);
    expect(preview.exceedsEncryptedRecordLimit).toBe(false);
    expect(localStorage.setItem).not.toHaveBeenCalled();
    expect(localStorage.removeItem).not.toHaveBeenCalled();
  });

  it('copies, reads back, and journals the vault while preserving the plaintext source', async () => {
    const source = '{"schemaVersion":2,"profile":{"email":"private@example.test"}}';
    const localStorage = createStorage({ [KNOWLEDGE_VAULT_LEGACY_STORAGE_KEY]: source });
    const records = new Map<string, string>();
    const secureRecordGet = vi.fn(
      async (_namespace: string, id: string) => records.get(id) ?? null
    );
    const secureRecordSet = vi.fn(async (_namespace: string, id: string, data: string) => {
      records.set(id, data);
    });
    vi.stubGlobal('window', { localStorage, electronAPI: { secureRecordGet, secureRecordSet } });

    const result = await migrateKnowledgeVaultToEncryptedStorage();

    expect(result.migrated).toBe(true);
    expect(result.verified).toBe(true);
    expect(result.failed).toBe(false);
    expect(records.get(KNOWLEDGE_VAULT_ENCRYPTED_RECORD_ID)).toBe(source);
    expect(records.has(KNOWLEDGE_VAULT_MIGRATION_JOURNAL_ID)).toBe(true);
    expect(localStorage.getItem(KNOWLEDGE_VAULT_LEGACY_STORAGE_KEY)).toBe(source);
    expect(localStorage.removeItem).not.toHaveBeenCalled();
  });

  it('verifies an identical encrypted record without rewriting the vault', async () => {
    const source = '{"schemaVersion":2}';
    const localStorage = createStorage({ [KNOWLEDGE_VAULT_LEGACY_STORAGE_KEY]: source });
    const records = new Map([[KNOWLEDGE_VAULT_ENCRYPTED_RECORD_ID, source]]);
    const secureRecordSet = vi.fn(async (_namespace: string, id: string, data: string) => {
      records.set(id, data);
    });
    vi.stubGlobal('window', {
      localStorage,
      electronAPI: {
        secureRecordGet: async (_namespace: string, id: string) => records.get(id) ?? null,
        secureRecordSet,
      },
    });

    const result = await migrateKnowledgeVaultToEncryptedStorage();

    expect(result.verified).toBe(true);
    expect(result.migrated).toBe(false);
    expect(secureRecordSet).toHaveBeenCalledTimes(1);
    expect(secureRecordSet).toHaveBeenCalledWith(
      'knowledge-vault',
      KNOWLEDGE_VAULT_MIGRATION_JOURNAL_ID,
      expect.any(String)
    );
  });

  it('does not overwrite a conflicting encrypted vault', async () => {
    const localStorage = createStorage({ [KNOWLEDGE_VAULT_LEGACY_STORAGE_KEY]: 'legacy' });
    const records = new Map([[KNOWLEDGE_VAULT_ENCRYPTED_RECORD_ID, 'newer-encrypted-vault']]);
    const secureRecordSet = vi.fn(async (_namespace: string, id: string, data: string) => {
      records.set(id, data);
    });
    vi.stubGlobal('window', {
      localStorage,
      electronAPI: {
        secureRecordGet: async (_namespace: string, id: string) => records.get(id) ?? null,
        secureRecordSet,
      },
    });

    const result = await migrateKnowledgeVaultToEncryptedStorage();

    expect(result.conflict).toBe(true);
    expect(result.migrated).toBe(false);
    expect(records.get(KNOWLEDGE_VAULT_ENCRYPTED_RECORD_ID)).toBe('newer-encrypted-vault');
    expect(localStorage.getItem(KNOWLEDGE_VAULT_LEGACY_STORAGE_KEY)).toBe('legacy');
  });

  it('rejects vaults larger than the encrypted record limit without writing', async () => {
    const source = 'x'.repeat(KNOWLEDGE_VAULT_MAX_RECORD_BYTES + 1);
    const localStorage = createStorage({ [KNOWLEDGE_VAULT_LEGACY_STORAGE_KEY]: source });
    const secureRecordSet = vi.fn();
    vi.stubGlobal('window', {
      localStorage,
      electronAPI: {
        secureRecordGet: vi.fn(),
        secureRecordSet,
      },
    });

    const result = await migrateKnowledgeVaultToEncryptedStorage();

    expect(result.failed).toBe(true);
    expect(result.reason).toContain('5 MiB');
    expect(secureRecordSet).not.toHaveBeenCalled();
    expect(localStorage.getItem(KNOWLEDGE_VAULT_LEGACY_STORAGE_KEY)).toBe(source);
  });

  it('fails closed when encrypted desktop storage is unavailable', async () => {
    const localStorage = createStorage({ [KNOWLEDGE_VAULT_LEGACY_STORAGE_KEY]: 'legacy' });
    vi.stubGlobal('window', { localStorage, electronAPI: {} });

    await expect(migrateKnowledgeVaultToEncryptedStorage()).rejects.toThrow(
      'Encrypted desktop storage is unavailable'
    );
    expect(localStorage.getItem(KNOWLEDGE_VAULT_LEGACY_STORAGE_KEY)).toBe('legacy');
  });
});
