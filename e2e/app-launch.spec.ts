import { test, expect, _electron as electron } from '@playwright/test';
import path from 'path';

test('Electron app launches with normal visible window and correct title', async () => {
  const env = { ...process.env, NODE_ENV: 'test' };
  delete env.ELECTRON_RUN_AS_NODE;

  const electronApp = await electron.launch({
    args: ['.', '--no-sandbox'],
    env,
  });

  try {
    const window = await electronApp.firstWindow();
    expect(window).toBeTruthy();

    const title = await window.title();
    expect(title).toContain('AI Interview');
  } finally {
    await electronApp.close();
  }
});
