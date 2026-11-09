export type OnboardingCredentialWriter = (
  service: string,
  key: string
) => Promise<boolean>;

/**
 * Store a key before onboarding is marked complete. An empty value is an
 * intentional "configure later" choice; a supplied key must be durably stored.
 */
export async function persistOnboardingCredential(
  service: string,
  key: string,
  writeCredential?: OnboardingCredentialWriter
): Promise<void> {
  const trimmedKey = key.trim();
  if (!trimmedKey) return;

  if (typeof writeCredential !== 'function') {
    throw new Error(
      'Secure credential storage is unavailable. Your key was not saved; configure it later in Settings.'
    );
  }

  const stored = await writeCredential(service, trimmedKey);
  if (stored !== true) {
    throw new Error(
      'The API key could not be saved. Onboarding was not completed; check storage and try again.'
    );
  }
}
