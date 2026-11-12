import { describe, it, expect, beforeEach } from 'vitest';
import { useCareerOpsOnboardingStore } from '../src/store/useCareerOpsOnboardingStore';
import { useControlsStore } from '../src/store/useControlsStore';

describe('CareerOps Screen 9: 60-Second Onboarding Flow (< 60s to First Value)', () => {
  beforeEach(() => {
    useCareerOpsOnboardingStore.getState().resetOnboarding();
    useControlsStore.getState().resetToDefaults();
  });

  it('initializes with 4 progressive stages and closed modal', () => {
    const state = useCareerOpsOnboardingStore.getState();
    expect(state.currentStep).toBe(1);
    expect(state.isOpen).toBe(false);
    expect(state.timeToFirstValueMs).toBeNull();
    expect(state.rankedJobs.length).toBe(3);
  });

  it('opens onboarding and allows updating identity & seniority in Step 1', () => {
    useCareerOpsOnboardingStore.getState().openOnboarding();
    expect(useCareerOpsOnboardingStore.getState().isOpen).toBe(true);

    useCareerOpsOnboardingStore.getState().updatePreferences({
      name: 'Morgan Dev',
      seniority: 'staff',
      requiresSponsorship: true,
    });

    const prefs = useCareerOpsOnboardingStore.getState().preferences;
    expect(prefs.name).toBe('Morgan Dev');
    expect(prefs.seniority).toBe('staff');
    expect(prefs.requiresSponsorship).toBe(true);
  });

  it('manages target roles with addition and removal in Step 2', () => {
    useCareerOpsOnboardingStore.getState().setStep(2);
    expect(useCareerOpsOnboardingStore.getState().currentStep).toBe(2);

    useCareerOpsOnboardingStore.getState().addTargetRole('Platform Architect');
    expect(useCareerOpsOnboardingStore.getState().preferences.targetRoles).toContain('Platform Architect');

    useCareerOpsOnboardingStore.getState().removeTargetRole('Platform Architect');
    expect(useCareerOpsOnboardingStore.getState().preferences.targetRoles).not.toContain('Platform Architect');
  });

  it('records timeToFirstValueMs strictly upon transition to Step 3 (First Value)', () => {
    useCareerOpsOnboardingStore.getState().openOnboarding();
    expect(useCareerOpsOnboardingStore.getState().timeToFirstValueMs).toBeNull();

    // Transition to Step 3
    useCareerOpsOnboardingStore.getState().setStep(3);
    const elapsed = useCareerOpsOnboardingStore.getState().timeToFirstValueMs;

    expect(elapsed).not.toBeNull();
    expect(elapsed).toBeGreaterThanOrEqual(0);
    // Verified to be sub-second in in-memory test
    expect(elapsed).toBeLessThan(1000);
  });

  it('provides structured profile audit and top 3 ranked jobs with explainability tags', () => {
    const { profileAudit, rankedJobs } = useCareerOpsOnboardingStore.getState();

    expect(profileAudit.score).toBeGreaterThanOrEqual(80);
    expect(profileAudit.detectedSkills.length).toBeGreaterThan(0);
    expect(profileAudit.keyStrengths.length).toBeGreaterThan(0);

    expect(rankedJobs.length).toBe(3);
    rankedJobs.forEach((job) => {
      expect(job.matchScore).toBeGreaterThanOrEqual(85);
      expect(job.matchReasons.length).toBeGreaterThan(0);
    });
  });

  it('simulates Gmail OAuth connection in Step 4 with plain-language scope explanation', async () => {
    useCareerOpsOnboardingStore.getState().setStep(4);
    expect(useCareerOpsOnboardingStore.getState().gmailConnected).toBe(false);

    await useCareerOpsOnboardingStore.getState().connectGmail();
    expect(useCareerOpsOnboardingStore.getState().gmailConnected).toBe(true);
  });

  it('completes onboarding and finishes by closing the modal and exporting results', () => {
    useCareerOpsOnboardingStore.getState().openOnboarding();
    useCareerOpsOnboardingStore.getState().updatePreferences({
      salaryFloor: 165000,
    });

    const result = useCareerOpsOnboardingStore.getState().finishOnboarding();
    expect(result.preferences.salaryFloor).toBe(165000);
    expect(useCareerOpsOnboardingStore.getState().isOpen).toBe(false);
  });
});

