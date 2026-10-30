import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Guards on the *packaging* pipeline, not on the app.
 *
 * The failure this prevents is silent and expensive: the Playwright suite builds
 * with VITE_DEMO_FIXTURES=true, and if the Android packaging step ever reuses
 * that `dist/` unchanged, a store build ships sample rows. Nothing in the app
 * can detect that — the bundle is already assembled.
 */
const ROOT = process.cwd();
const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>;
};

describe('release packaging pipeline', () => {
  it('forces demo fixtures off for the bundle that goes into the APK', () => {
    // The Android path must not use the plain `build` script.
    expect(pkg.scripts['android:sync']).toContain('build:release');
    expect(pkg.scripts['build:release']).toContain('build-release.mjs');
  });

  it('overrides the flag regardless of the shell environment or an .env file', () => {
    const source = readFileSync(join(ROOT, 'scripts/build-release.mjs'), 'utf8');
    // It must set the variable itself rather than trusting the caller.
    expect(source).toMatch(/VITE_DEMO_FIXTURES:\s*'false'/);
    expect(source).toContain("spawnSync('npx', ['vite', 'build']");
  });

  it('keeps the authoritative runtime gate available', () => {
    // A static string scan proves nothing (fixture text survives as dead code),
    // so a real browser must confirm the built app opens empty.
    expect(pkg.scripts['verify:release']).toContain('verify-release.mjs');
  });
});
