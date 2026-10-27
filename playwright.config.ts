import { defineConfig, devices } from '@playwright/test';
import { chromiumEnv, chromiumExecutablePath } from './scripts/playwright-browser.mjs';

/**
 * Browser E2E. Runs against the Vite dev server in local-demo mode, so no
 * Supabase project or network access is required.
 *
 * The executable is resolved at config load; if the packaged browsers are not
 * installed this fails fast with the shim's error rather than silently passing.
 */
const executablePath = await chromiumExecutablePath();

export default defineConfig({
  testDir: './tests/e2e',
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      executablePath,
      env: chromiumEnv(),
      args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});
