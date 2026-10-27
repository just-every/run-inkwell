import { chromium } from '@playwright/test';

const browser = await chromium.launch({
  headless: true,
  // Avoid macOS keychain prompts when running the same probe locally.
  ...(process.platform === 'darwin'
    ? { args: ['--use-mock-keychain', '--password-store=basic'] }
    : {}),
});
await browser.close();
