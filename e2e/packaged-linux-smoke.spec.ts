import { test, expect, _electron as electron } from '@playwright/test';
import fs from 'fs';

test('launches the packaged Electron application and loads its production renderer', async () => {
  const executablePath = process.env.IAC_PACKAGED_EXECUTABLE;
  test.skip(
    !executablePath,
    'Packaged Linux smoke test runs only after electron-builder creates the artifact.'
  );

  if (!executablePath) return;

  expect(fs.existsSync(executablePath)).toBe(true);

  const env = { ...process.env, NODE_ENV: 'production' };
  delete env.ELECTRON_RUN_AS_NODE;
  delete env.VITE_DEV_SERVER_URL;

  const electronApp = await electron.launch({
    executablePath,
    args: process.platform === 'linux' ? ['--no-sandbox'] : [],
    env,
  });

  try {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await expect(window).toHaveTitle(/AI Interview/i);
    expect(window.url()).toContain('app.asar/dist/index.html');

    const preloadAvailable = await window.evaluate(
      () => typeof (window as any).electronAPI !== 'undefined'
    );
    expect(preloadAvailable).toBe(true);
  } finally {
    await electronApp.close();
  }
});
