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
 * Set AUDIT_BASE to audit another origin, e.g. a production preview.
 */
import { chromium } from 'playwright';
import { chromiumExecutablePath, chromiumEnv } from './playwright-browser.mjs';
const BASE = process.env.AUDIT_BASE ?? 'http://127.0.0.1:5173';
// Every route declared in src/app/AppRoutes.tsx, plus the wildcard.
const ROUTES = ['/','/curriculum','/curriculum/templates','/subjects','/lectures','/sessions','/revisions','/revisions/smart','/tasks','/difficulties','/mistakes','/exams','/exams/prep','/notes','/vault','/reports','/reminders','/settings','/syllabus','/time','/planner','/weakness','/practice','/focus','/insights','/export','/more'];

/**
 * Start the local workspace and answer onboarding.
 *
 * Without this the audit measured the onboarding screen once per route and
 * printed "ok" for all 25 — a green run that verified nothing. It now throws
 * rather than reporting success on a screen it never reached.
 */
async function boot(pg) {
  await pg.goto(BASE + '/', { waitUntil: 'networkidle' });
  /*
   * Since v1.0.0 the welcome screen asks for the class (and group) itself, so
   * this is the real first-run path. The older onboarding flow is kept as a
   * fallback for a build that still asks after sign-in.
   */
  const start = pg.getByRole('button', { name: /start on this device|start local workspace/i });
  if (await start.count()) {
    await pg.getByRole('button', { name: 'Class 11', exact: true }).click().catch(() => {});
    const groupChip = pg.getByRole('radio', { name: 'Science', exact: true });
    if (await groupChip.count()) await groupChip.click();
    await start.first().click();
  }

  const onboarding = pg.getByRole('heading', { name: /which class do you study in/i });
  await Promise.race([onboarding.waitFor({ timeout: 6000 }).catch(() => {}), pg.waitForTimeout(6200)]);
  if (await onboarding.count()) {
    await pg.getByRole('button', { name: '11', exact: true }).click();
    await pg.getByRole('button', { name: /^continue/i }).click();
    const groupStep = pg.getByRole('heading', { name: /which group are you in/i });
    if (await groupStep.count()) {
      await pg.getByRole('radio', { name: /Science/i }).click();
      await pg.getByRole('button', { name: /start studying/i }).click();
    }
  }
  await pg.waitForTimeout(1200);
  const heading = await pg.locator('h1').first().textContent().catch(() => '');
  if (/which class do you study in/i.test(heading ?? '')) {
    throw new Error('route audit is stuck on onboarding; every route would be measured as the same screen');
  }
  if (!(await pg.getByRole('main').count())) {
    throw new Error('route audit could not open the workspace; a green run would measure the welcome screen');
  }
}
const browser = await chromium.launch({ executablePath: await chromiumExecutablePath(), env: chromiumEnv(), args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
const ctx = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('PAGEERROR ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await boot(page);

const report = [];
for (const route of ROUTES) {
  errors.length = 0;
  await page.goto(BASE + '/#' + route, { waitUntil: 'networkidle' });
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
await boot(mp);
let mobileBad = [];
for (const route of ROUTES) {
  await mp.goto(BASE + '/#' + route, { waitUntil: 'networkidle' });
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

// A route with no heading or no text is a broken screen, not a quiet one.
const broken = report.filter((r) => !r.h1 || r.overflow > 0 || r.text < 40 || r.errors.length > 0);
if (broken.length || mobileBad.length) {
  console.log(`FAILED: ${broken.length} desktop route(s), ${mobileBad.length} mobile overflow`);
  process.exitCode = 1;
} else {
  console.log(`PASS: ${ROUTES.length} routes render a heading with no overflow and no console error`);
}
await browser.close();
