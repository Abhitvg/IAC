export type CredentialWriter = (service: string, key: string) => Promise<boolean>;
export type CredentialDeleteWriter = (service: string) => Promise<boolean>;

/**
 * Persist a non-empty provider API key and fail closed when the protected
 * credential writer is absent or reports that it did not save the key.
 */
export async function persistCredential(
  service: string,
  key: string,
  writeCredential?: CredentialWriter
): Promise<void> {
  const trimmedKey = key.trim();
  if (!trimmedKey) {
    throw new Error('API key must not be empty.');
  }

  if (typeof writeCredential !== 'function') {
    throw new Error(
      'Secure credential storage is unavailable. Your API key was not saved; use the desktop app with an OS-backed credential provider.'
    );
  }

  const stored = await writeCredential(service, trimmedKey);
  if (stored !== true) {
    throw new Error('The API key could not be saved. Check secure storage and try again.');
  }
}

/**
 * Delete a stored provider key and fail closed if the protected IPC method is
 * missing or reports that the credential was not deleted.
 */
export async function deleteStoredCredential(
  service: string,
  deleteCredential?: CredentialDeleteWriter
): Promise<void> {
  if (typeof deleteCredential !== 'function') {
    throw new Error('Secure credential storage is unavailable. The API key was not deleted.');
  }

  const deleted = await deleteCredential(service);
  if (deleted !== true) {
    throw new Error('The API key could not be deleted from secure storage.');
  }
}

/**
 * Onboarding permits the user to intentionally skip entering a key and
 * configure it later in Settings. A supplied key, however, must be persisted.
 */
export async function persistOnboardingCredential(
  service: string,
  key: string,
  writeCredential?: CredentialWriter
): Promise<void> {
  if (!key.trim()) return;
  await persistCredential(service, key, writeCredential);
}
