/**
 * Release gate: prove the store build contains no demo fixtures.
 *
 * The browser suite deliberately builds with VITE_DEMO_FIXTURES=true so it has
 * data to drive. That means the suite cannot answer the one question that
 * matters for a public release: does a *production* build open empty? This
 * script builds the real production bundle, serves it, starts a workspace the
 * way a new student would, and fails if any sample row, sample label or sample
 * curriculum title is present.
 *
 * Usage: npm run verify:release   (needs no Supabase project)
 */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { chromium } from 'playwright';
import { chromiumExecutablePath, chromiumEnv } from './playwright-browser.mjs';

const DIST = resolve('dist');
const PORT = 4188;
const MIME = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
};

const problems = [];

async function serveDist() {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', 'http://localhost');
    let path = join(DIST, decodeURIComponent(url.pathname));
    try {
      const file = await readFile(path);
      res.writeHead(200, { 'content-type': MIME[extname(path)] ?? 'application/octet-stream' });
      res.end(file);
    } catch {
      try {
        const file = await readFile(join(DIST, 'index.html'));
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(file);
      } catch {
        res.writeHead(404).end('not found');
      }
    }
  });
  await new Promise((done) => server.listen(PORT, '127.0.0.1', done));
  return server;
}

/*
 * A static string scan was tried and removed: fixture code is compiled into a
 * chunk even when it never renders (the button text "Load demo data" exists
 * inside a build-time-false branch). What matters is what a new student sees and
 * what gets written, and both are asserted below.
 */

const server = await serveDist();
const browser = await chromium.launch({
  executablePath: await chromiumExecutablePath(),
  env: chromiumEnv(),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const consoleErrors = [];
  page.on('pageerror', (error) => consoleErrors.push(error.message));

  await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });

  // 1. The welcome screen must not offer sample data.
  const sampleToggle = page.getByText(/sample data|demo data/i);
  if (await sampleToggle.count()) problems.push('welcome screen still offers sample/demo data');

  // 2. A new workspace starts empty.
  await page.getByRole('button', { name: 'Class 11', exact: true }).click();
  await page.getByRole('radio', { name: 'Science', exact: true }).click();
  await page.getByRole('button', { name: /start on this device/i }).click();
  await page.getByText(/no subjects yet|welcome,/i).first().waitFor({ timeout: 20_000 });
  const bodyText = await page.locator('body').innerText();
  if (!/no subjects yet|add subject/i.test(bodyText)) {
    problems.push(`expected an empty dashboard, saw: ${bodyText.slice(0, 160).replace(/\n+/g, ' ')}`);
  }

  const badgeText = await page.getByRole('main').innerText();
  if (/\bdemo\b/i.test(badgeText)) problems.push('dashboard still shows a demo label');
  if (/physics|chemistry|demo chapter/i.test(badgeText)) problems.push('dashboard shows sample subjects');

  // 3. Nothing demo-shaped was written into storage, including reference data.
  const stored = await page.evaluate(() => window.localStorage.getItem('mkj.studyos.v1.db'));
  if (!stored) {
    problems.push('no local database was created');
  } else {
    const db = JSON.parse(stored);
    const demoVersion = JSON.stringify(db).includes('demo-v1');
    const demoChapter = JSON.stringify(db).includes('Demo chapter');
    const demoRows = Object.values(db.tables ?? {}).some(
      (rows) => Array.isArray(rows) && rows.some((row) => row && row.is_demo === true),
    );
    if (demoVersion) problems.push('demo curriculum version merged into a store build');
    if (demoChapter) problems.push('demo chapters merged into a store build');
    if (demoRows) problems.push('demo rows written into an empty workspace');
  }

  if (consoleErrors.length) problems.push(`console errors: ${consoleErrors.slice(0, 3).join(' | ')}`);

  await page.screenshot({ path: '/tmp/release-empty-state.png' });
} finally {
  await browser.close();
  server.close();
}

if (problems.length) {
  console.log('FAIL');
  for (const problem of problems) console.log(` - ${problem}`);
  process.exitCode = 1;
} else {
  console.log('PASS: production build opens empty — no demo rows, labels or chapter titles');
}
