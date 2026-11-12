import { test, expect, _electron as electron } from '@playwright/test';

test.describe('CareerOps Critical Paths E2E (Electron)', () => {
  test('Critical Path 1: 60-Second Onboarding Flow to First Value', async () => {
    const env = { ...process.env, NODE_ENV: 'test' };
    delete env.ELECTRON_RUN_AS_NODE;

    const electronApp = await electron.launch({
      args: ['.', '--no-sandbox'],
      env,
    });

    try {
      const window = await electronApp.firstWindow();
      expect(window).toBeTruthy();
      await window.waitForLoadState('domcontentloaded');

      // 1. Open CareerOps navigation
      const careerOpsTab = window.locator('button, [role="button"]').filter({ hasText: /CareerOps/i }).first();
      if (await careerOpsTab.isVisible()) {
        await careerOpsTab.click();
      }

      // 2. Launch 60s Onboarding
      const onboardBtn = window.locator('button').filter({ hasText: /60s Onboarding/i }).first();
      await expect(onboardBtn).toBeVisible({ timeout: 10000 });
      await onboardBtn.click();

      // 3. Verify Step 1: Candidate Identity
      const dialog = window.locator('div[role="dialog"][aria-modal="true"]');
      await expect(dialog).toBeVisible({ timeout: 5000 });
      await expect(dialog).toContainText(/Confirm Your Candidate Identity/i);

      // Advance to Step 2
      const step1Next = dialog.locator('button').filter({ hasText: /Next: Target Roles & Comp/i });
      await step1Next.click();

      // 4. Verify Step 2: Target Roles & Comp Floor
      await expect(dialog).toContainText(/Target Roles & Compensation Floor/i);
      const step2Next = dialog.locator('button').filter({ hasText: /Discover Matching Roles & Audit Profile/i });
      await step2Next.click();

      // 5. Verify Step 3: First Value (Profile Audit & Top 3 Matches)
      await expect(dialog).toContainText(/Instant Profile Audit & Top Matches Unlocked/i);
      await expect(dialog).toContainText(/Profile Strength Score/i);
      await expect(dialog).toContainText(/Anthropic/i);

      // Advance to Step 4
      const step3Next = dialog.locator('button').filter({ hasText: /Configure Mail & Automation Permissions/i });
      await step3Next.click();

      // 6. Verify Step 4: Transparent Gmail Scope Consent
      await expect(dialog).toContainText(/Connect Gmail/i);
      await expect(dialog).toContainText(/Send Application & Follow-up Emails on Your Behalf/i);

      // Complete Onboarding
      const finishBtn = dialog.locator('button').filter({ hasText: /Enter CareerOps Workspace/i });
      await finishBtn.click();

      await expect(dialog).toBeHidden();
    } finally {
      await electronApp.close();
    }
  });

  test('Critical Path 2: Controls, Velocity Caps & Emergency Kill Switch', async () => {
    const env = { ...process.env, NODE_ENV: 'test' };
    delete env.ELECTRON_RUN_AS_NODE;

    const electronApp = await electron.launch({
      args: ['.', '--no-sandbox'],
      env,
    });

    try {
      const window = await electronApp.firstWindow();
      expect(window).toBeTruthy();
      await window.waitForLoadState('domcontentloaded');

      // Navigate to CareerOps
      const careerOpsTab = window.locator('button, [role="button"]').filter({ hasText: /CareerOps/i }).first();
      if (await careerOpsTab.isVisible()) {
        await careerOpsTab.click();
      }

      // Switch to Controls & Privacy tab
      const controlsTab = window.locator('button').filter({ hasText: /Controls & Privacy/i }).first();
      await expect(controlsTab).toBeVisible({ timeout: 10000 });
      await controlsTab.click();

      // Verify Controls loaded
      await expect(window.locator('text=Governance, Safety Caps & Privacy')).toBeVisible();

      // Engage Emergency Kill Switch
      const killSwitchBtn = window.locator('button').filter({ hasText: /Emergency Stop/i }).first();
      await killSwitchBtn.click();

      // Verify active alert banner
      await expect(window.locator('role=alert')).toContainText(/GLOBAL EMERGENCY KILL SWITCH ACTIVE/i);

      // Resume systems
      const resumeBtn = window.locator('button').filter({ hasText: /Resume Systems/i }).first();
      await resumeBtn.click();
      await expect(window.locator('role=alert')).toBeHidden();
    } finally {
      await electronApp.close();
    }
  });
});
