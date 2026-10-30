#!/usr/bin/env node
/**
 * Regenerate the Android splash images from the app's own logo mark.
 *
 * Why this exists: `npx cap add android` writes the Capacitor template's splash
 * (a blue X on white), and nothing in the build fails when it stays there — the
 * app simply launches with somebody else's logo. The launcher icons were already
 * generated from `public/logo-mark.svg`; this keeps the splash consistent with
 * them and makes a re-brand a one-command change instead of eleven hand edits.
 *
 * Usage:  node scripts/generate-splash.mjs
 * Output: android/app/src/main/res/drawable-(port|land)-*\/splash.png, at the
 *         exact pixel sizes the existing files had, so no qualifier changes.
 */
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { chromiumExecutablePath, chromiumEnv } from './playwright-browser.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const RES = join(ROOT, 'android/app/src/main/res');
const LOGO = readFileSync(join(ROOT, 'public/logo-mark.svg'), 'utf8');

/** The sizes the Capacitor template ships with: portrait and landscape per density. */
const SIZES = [
  ['drawable', 480, 320],
  ['drawable-land-mdpi', 480, 320],
  ['drawable-port-mdpi', 320, 480],
  ['drawable-land-hdpi', 800, 480],
  ['drawable-port-hdpi', 480, 800],
  ['drawable-land-xhdpi', 1280, 720],
  ['drawable-port-xhdpi', 720, 1280],
  ['drawable-land-xxhdpi', 1600, 960],
  ['drawable-port-xxhdpi', 960, 1600],
  ['drawable-land-xxxhdpi', 1920, 1280],
  ['drawable-port-xxxhdpi', 1280, 1920],
];

const browser = await chromium.launch({
  executablePath: await chromiumExecutablePath(),
  env: chromiumEnv(),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const page = await browser.newPage({ deviceScaleFactor: 1 });

for (const [dir, width, height] of SIZES) {
  const mark = Math.round(Math.min(width, height) * 0.3);
  await page.setViewportSize({ width, height });
  await page.setContent(`<!doctype html>
    <meta charset="utf-8">
    <style>
      html, body { margin: 0; height: 100%; }
      body {
        display: grid;
        place-items: center;
        background: linear-gradient(160deg, #f5f9ff 0%, #e0f2fe 100%);
      }
      svg { width: ${mark}px; height: ${mark}px; display: block; }
    </style>
    ${LOGO}`);
  const path = join(RES, dir, 'splash.png');
  await page.screenshot({ path, type: 'png' });
  const bytes = readFileSync(path).length;
  console.log(`${dir.padEnd(22)} ${width}x${height}  ${Math.round(bytes / 1024)} KB`);
}

await browser.close();
console.log('\nSplash images regenerated. Rebuild the APK to see them (npm run android:sync).');
