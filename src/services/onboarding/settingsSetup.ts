export type OnboardingSettingWriter = (key: string, value: unknown) => Promise<unknown>;

export type OnboardingSettingEntry = readonly [key: string, value: unknown];

/**
 * Persist onboarding settings one at a time and fail closed.
 *
 * Callers should put hasCompletedOnboarding last so a partial settings write
 * never marks setup complete. The in-memory store should only be updated after
 * this function resolves.
 */
export async function persistOnboardingSettings(
  settings: ReadonlyArray<OnboardingSettingEntry>,
  writeSetting?: OnboardingSettingWriter
): Promise<void> {
  if (typeof writeSetting !== 'function') {
    throw new Error(
      'Settings storage is unavailable. Your setup was not marked complete; try again in the desktop app.'
    );
  }

  for (const [key, value] of settings) {
    if (typeof key !== 'string' || !key.trim()) {
      throw new Error('An onboarding setting has an invalid key.');
    }

    const saved = await writeSetting(key, value);
    if (saved !== true) {
      throw new Error(
        `The "${key}" setting could not be saved. Onboarding was not marked complete.`
      );
    }
  }
}
