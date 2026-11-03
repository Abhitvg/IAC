import { test, expect, _electron as electron } from '@playwright/test';

test('Wizard accessibility, keyboard focus trap, Escape dismissal, and mobile viewport in real Electron app', async () => {
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

    // Bypass onboarding overlay if present by setting hasCompletedOnboarding
    await window.evaluate(async () => {
      try {
        if ((window as any).electronAPI?.setSettings) {
          await (window as any).electronAPI.setSettings('hasCompletedOnboarding', true);
        }
      } catch {}
    });
    await window.reload();
    await window.waitForLoadState('domcontentloaded');

    // 1. Locate and click Candidate Profile Wizard trigger in top bar
    const openWizardBtn = window.locator('button[aria-label="Open Candidate Profile Wizard"]');
    await expect(openWizardBtn).toBeVisible({ timeout: 10000 });
    await openWizardBtn.click();

    // 2. Dialog visibility and ARIA modal attributes
    const dialog = window.locator('div[role="dialog"][aria-modal="true"]');
    await expect(dialog).toBeVisible({ timeout: 5000 });

    const dialogTitle = window.locator('#wizard-title');
    await expect(dialogTitle).toHaveText(/Candidate Intelligence Wizard/i);

    // 3. Focus trapping within modal (Tab navigation)
    // Press Tab multiple times to verify keyboard focus remains inside the dialog
    await window.keyboard.press('Tab');
    let activeInside = await dialog.evaluate((node) => node.contains(document.activeElement));
    expect(activeInside).toBe(true);

    await window.keyboard.press('Tab');
    activeInside = await dialog.evaluate((node) => node.contains(document.activeElement));
    expect(activeInside).toBe(true);

    // 4. Escape key dismisses modal and restores focus
    await window.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 3000 });

    // Verify focus returned to interactive trigger
    const focusedAfterEscape = await window.evaluate(() => document.activeElement?.getAttribute('aria-label'));
    expect(focusedAfterEscape).toContain('Candidate Profile');

    // 5. Mobile viewport test (375x667 standard mobile portrait)
    await window.setViewportSize({ width: 375, height: 667 });

    // Open wizard in mobile viewport
    await openWizardBtn.click();
    await expect(dialog).toBeVisible({ timeout: 5000 });

    // Verify responsive shell and tabs render without error
    const sidebar = window.locator('.wizard-sidebar');
    await expect(sidebar).toBeVisible();

    // Verify step buttons render and can be clicked in mobile layout
    const educationTab = window.locator('button', { hasText: /Education/i }).first();
    await expect(educationTab).toBeVisible();
    await educationTab.click();

    // Close wizard via Escape in mobile viewport
    await window.keyboard.press('Escape');
    await expect(dialog).not.toBeVisible({ timeout: 3000 });
  } finally {
    await electronApp.close();
  }
});
