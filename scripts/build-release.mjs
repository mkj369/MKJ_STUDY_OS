#!/usr/bin/env node
/**
 * Build the web bundle that is allowed to go into a store APK.
 *
 * `npm run build` honours whatever `VITE_DEMO_FIXTURES` happens to be in the
 * environment or in a `.env` file. That is correct for development, and it is
 * exactly how a fixture build can reach a phone: the Playwright suite builds
 * with fixtures on (for its own good reasons), and a later `cap sync` would copy
 * that `dist/` straight into the APK without anyone rebuilding.
 *
 * This script removes the guesswork: it always builds with the flag forced to
 * 'false', regardless of the shell, the env file, or a previous build sitting in
 * `dist/`. Every Android packaging path goes through it.
 *
 * Usage: node scripts/build-release.mjs
 */
import { spawnSync } from 'node:child_process';

const env = { ...process.env, VITE_DEMO_FIXTURES: 'false' };

console.log('Building the release bundle with VITE_DEMO_FIXTURES=false …');
const result = spawnSync('npx', ['vite', 'build'], { stdio: 'inherit', env, shell: process.platform === 'win32' });

if (result.status !== 0) {
  console.error('\nRelease build failed. Nothing was copied into android/.');
  process.exit(result.status ?? 1);
}
if (process.env.VITE_DEMO_FIXTURES === 'true') {
  console.log('Note: VITE_DEMO_FIXTURES was set to "true" in the environment; it was overridden for this build.');
}
console.log('Release bundle ready in dist/ (no demo fixtures).');
