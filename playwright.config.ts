import { defineConfig, devices } from '@playwright/test';
import { chromiumEnv, chromiumExecutablePath } from './scripts/playwright-browser.mjs';

/**
 * Browser E2E. Builds the production bundle and serves it with `vite preview`, so the
 * lazy-loaded chunks, hashed assets and split vendor bundles are exercised — not just
 * the dev server. Local-demo mode means no Supabase project or network access is needed.
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
    baseURL: 'http://127.0.0.1:4173',
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
    /*
     * The suite runs against a production build, and the demo fixtures it
     * depends on are compiled out of real store builds. Setting the flag here
     * keeps the tests on the production bundle while still giving them sample
     * data — the same switch `npm run build` leaves off.
     */
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    env: { VITE_DEMO_FIXTURES: 'true' },
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: true,
    timeout: 180_000,
  },
});
