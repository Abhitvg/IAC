import { describe, it, expect, beforeEach } from 'vitest';
import { useControlsStore, getSavedGmailConnection, persistGmailConnection } from '../src/store/useControlsStore';

describe('CareerOps Gmail Connection & Authentication Engine', () => {
  beforeEach(() => {
    persistGmailConnection(null);
    useControlsStore.getState().resetToDefaults();
  });

  it('rejects connection if email format is invalid', async () => {
    const res = await useControlsStore.getState().connectGmailAccount('not-an-email', 'app_password', 'abcd efgh ijkl mnop');
    expect(res.success).toBe(false);
    expect(res.error).toContain('valid email address');

    const gmail = useControlsStore.getState().connectors.find((c) => c.id === 'gmail');
    expect(gmail?.status).toBe('disconnected');
  });

  it('connects Gmail account via Google App Password and updates connector state', async () => {
    const testEmail = 'alex.engineer@gmail.com';
    const res = await useControlsStore.getState().connectGmailAccount(testEmail, 'app_password', 'abcdefghijklmnop');

    expect(res.success).toBe(true);
    const gmail = useControlsStore.getState().connectors.find((c) => c.id === 'gmail');
    expect(gmail?.status).toBe('connected');
    expect(gmail?.accountEmail).toBe(testEmail);

    // Verify persisted
    const saved = getSavedGmailConnection();
    expect(saved).not.toBeNull();
    expect(saved?.email).toBe(testEmail);
    expect(saved?.method).toBe('app_password');
  });

  it('connects Gmail account via Google OAuth 2.0 Web Flow', async () => {
    const testEmail = 'alex.dev@googlemail.com';
    const res = await useControlsStore.getState().connectGmailAccount(testEmail, 'oauth');

    expect(res.success).toBe(true);
    const gmail = useControlsStore.getState().connectors.find((c) => c.id === 'gmail');
    expect(gmail?.status).toBe('connected');
    expect(gmail?.accountEmail).toBe(testEmail);
  });

  it('connects Gmail account via Sandbox Mode for offline testing', async () => {
    const testEmail = 'candidate.sandbox@gmail.com';
    const res = await useControlsStore.getState().connectGmailAccount(testEmail, 'sandbox');

    expect(res.success).toBe(true);
    const gmail = useControlsStore.getState().connectors.find((c) => c.id === 'gmail');
    expect(gmail?.status).toBe('connected');
    expect(gmail?.accountEmail).toBe(testEmail);
  });

  it('disconnects Gmail connector and clears persisted connection', async () => {
    const testEmail = 'alex.engineer@gmail.com';
    await useControlsStore.getState().connectGmailAccount(testEmail, 'app_password', 'abcdefghijklmnop');

    expect(useControlsStore.getState().connectors.find((c) => c.id === 'gmail')?.status).toBe('connected');

    useControlsStore.getState().disconnectGmailAccount();

    const gmail = useControlsStore.getState().connectors.find((c) => c.id === 'gmail');
    expect(gmail?.status).toBe('disconnected');
    expect(gmail?.accountEmail).toBeUndefined();

    const saved = getSavedGmailConnection();
    expect(saved).toBeNull();
  });

  it('opens and closes Gmail connection modal from store', () => {
    expect(useControlsStore.getState().isGmailModalOpen).toBe(false);

    useControlsStore.getState().openGmailModal();
    expect(useControlsStore.getState().isGmailModalOpen).toBe(true);

    useControlsStore.getState().closeGmailModal();
    expect(useControlsStore.getState().isGmailModalOpen).toBe(false);
  });
});
