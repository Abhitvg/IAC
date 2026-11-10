import { test, expect, _electron as electron } from '@playwright/test';

test('main application shell has no page-level horizontal overflow at common viewport sizes', async () => {
  const env = { ...process.env, NODE_ENV: 'test' };
  delete env.ELECTRON_RUN_AS_NODE;

  const electronApp = await electron.launch({
    args: ['.', '--no-sandbox'],
    env,
  });

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');

    await window.evaluate(async () => {
      await window.electronAPI?.setSettings('hasCompletedOnboarding', true);
    });
    await window.reload();
    await window.waitForLoadState('domcontentloaded');

    for (const viewport of [
      { width: 375, height: 667 },
      { width: 768, height: 900 },
      { width: 1024, height: 768 },
      { width: 1440, height: 900 },
    ]) {
      await window.setViewportSize(viewport);

      const metrics = await window.evaluate(() => ({
        viewportWidth: document.documentElement.clientWidth,
        documentWidth: document.documentElement.scrollWidth,
        bodyWidth: document.body.scrollWidth,
      }));

      expect(
        metrics.documentWidth,
        `Document overflowed horizontally at ${viewport.width}px: ${JSON.stringify(metrics)}`
      ).toBeLessThanOrEqual(metrics.viewportWidth + 1);
      expect(
        metrics.bodyWidth,
        `Body overflowed horizontally at ${viewport.width}px: ${JSON.stringify(metrics)}`
      ).toBeLessThanOrEqual(metrics.viewportWidth + 1);
    }
  } finally {
    await electronApp.close();
  }
});
