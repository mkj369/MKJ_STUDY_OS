/**
 * Verification tool, kept in the repo on purpose (Round 8).
 *
 * A green test suite says the app did what the tests assert; it does not say the
 * app looks right. These two scripts check what tests usually miss, and both were
 * used to catch real defects this round rather than being written afterwards:
 *
 *   route-audit.mjs    — every route renders a heading, has no console error, no
 *                        horizontal overflow at 1440px *and* 390px.
 *   contrast-audit.mjs — every piece of visible text meets WCAG AA against its
 *                        real painted background (alpha and gradients composited).
 *                        It plants an intentionally unreadable element first and
 *                        fails if the audit does not catch it.
 *
 * Usage: npm run dev (port 5173), then `node scripts/route-audit.mjs`.
 */
import { chromium } from 'playwright';
import { chromiumExecutablePath, chromiumEnv } from './playwright-browser.mjs';
// Every route declared in src/app/AppRoutes.tsx, plus the wildcard.
const ROUTES = ['/','/curriculum','/subjects','/lectures','/sessions','/revisions','/revisions/smart','/tasks','/difficulties','/mistakes','/exams','/exams/prep','/notes','/reports','/reminders','/settings','/syllabus','/time','/planner','/weakness','/practice','/vault','/focus','/insights','/export'];
const browser = await chromium.launch({ executablePath: await chromiumExecutablePath(), env: chromiumEnv(), args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
const start = page.getByRole('button', { name: /Start local workspace/i });
if (await start.count()) await start.first().click();
await page.waitForTimeout(2500);

const report = [];
for (const route of ROUTES) {
  errors.length = 0;
  await page.goto('http://127.0.0.1:5173/#' + route, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  const info = await page.evaluate(() => {
    const main = document.querySelector('main');
    return {
      h1: document.querySelector('main h1')?.textContent?.trim().slice(0, 40) ?? null,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
      text: (main?.textContent ?? '').trim().length,
    };
  });
  report.push({ route, ...info, errors: errors.slice(0, 2) });
}
const mobile = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const mp = await mobile.newPage();
await mp.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
const ms = mp.getByRole('button', { name: /Start local workspace/i });
if (await ms.count()) await ms.first().click();
await mp.waitForTimeout(2500);
let mobileBad = [];
for (const route of ROUTES) {
  await mp.goto('http://127.0.0.1:5173/#' + route, { waitUntil: 'networkidle' });
  await mp.waitForTimeout(500);
  const o = await mp.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  if (o > 0) mobileBad.push(`${route}: ${o}px`);
}
console.log('=== DESKTOP ===');
for (const r of report) {
  const bad = !r.h1 || r.overflow > 0 || r.text < 40 || r.errors.length;
  console.log(`${bad ? 'FAIL' : ' ok '} ${r.route.padEnd(14)} h1=${(r.h1 ?? 'NONE').padEnd(28)} ovf=${r.overflow} ${r.errors.join(' | ')}`);
}
console.log('=== MOBILE 390px overflow ===');
console.log(mobileBad.length ? mobileBad.join('\n') : 'none across all routes');
await browser.close();
