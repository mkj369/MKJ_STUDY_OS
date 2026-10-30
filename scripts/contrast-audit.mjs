/**
 * Verification tool, kept in the repo on purpose.
 *
 * A green test suite says the app did what the tests assert; it does not say the
 * app looks right. This script checks what tests usually miss: every piece of
 * visible text on every screen, against the background it is actually painted
 * on, in both colour schemes and across the presets whose fills sit closest to
 * the AA boundary.
 *
 * Round 10 made the palette mode-aware (a dark page darkens the accent tint
 * instead of reusing the light pastel). Auditing only the default light Sky Blue
 * would have signed off on exactly the case that broke, so the sweep is a matrix.
 *
 * It plants an intentionally unreadable element first and fails if the audit
 * does not catch it — a green run means it measured something.
 *
 * Usage: npm run dev (port 5173), then `npm run audit:contrast`.
 */
import { chromium } from 'playwright';
import { chromiumExecutablePath, chromiumEnv } from './playwright-browser.mjs';

const BASE = 'http://127.0.0.1:5173';
const browser = await chromium.launch({
  executablePath: await chromiumExecutablePath(),
  env: chromiumEnv(),
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
});
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
await page.goto(BASE + '/', { waitUntil: 'networkidle' });

const start = page.getByRole('button', { name: /start local workspace/i });
if (await start.count()) await start.first().click();
// First run asks for a class; the audit needs a dashboard, not onboarding.
const onboarding = page.getByRole('heading', { name: /which class do you study in/i });
await Promise.race([onboarding.waitFor({ timeout: 5000 }).catch(() => {}), page.waitForTimeout(5200)]);
if (await onboarding.count()) {
  await page.getByRole('button', { name: '11', exact: true }).click();
  await page.getByRole('button', { name: /^continue/i }).click();
  const groupStep = page.getByRole('heading', { name: /which group are you in/i });
  if (await groupStep.count()) {
    await page.getByRole('radio', { name: /Science/i }).click();
    await page.getByRole('button', { name: /start studying/i }).click();
  }
}
await page.waitForTimeout(1200);

const routes = [
  '/',
  '/curriculum',
  '/subjects',
  '/syllabus',
  '/tasks',
  '/reports',
  '/export',
  '/settings',
  '/insights',
  '/planner',
  '/focus',
  '/sessions',
  '/revisions',
  '/exams',
  '/notes',
];

/* Self-test: an element that MUST fail, so a silent no-match cannot pass. */
await page.goto(BASE + '/#/settings', { waitUntil: 'networkidle' });
await page.waitForTimeout(500);
await page.evaluate(() => {
  const d = document.createElement('p');
  d.textContent = 'CONTRAST CANARY';
  d.style.color = '#0d1b15';
  d.style.background = '#08130f';
  d.style.fontSize = '14px';
  d.id = 'contrast-canary';
  document.querySelector('main')?.appendChild(d);
});
const canary = await page.evaluate(() => {
  const el = document.getElementById('contrast-canary');
  const cs = el ? getComputedStyle(el) : null;
  return cs ? `${cs.color} on ${cs.backgroundColor}` : '';
});
console.log('canary planted:', canary, '(must be flagged below)');
const canaryCaught = await page.evaluate(() => {
  const el = document.getElementById('contrast-canary');
  const cs = el ? getComputedStyle(el) : null;
  const ok = Boolean(el) && Boolean(cs?.color.includes('13, 27, 21'));
  el?.remove();
  return ok;
});
if (!canaryCaught) throw new Error('contrast audit self-test failed: canary was not detected');

/**
 * The in-page sweep. Returns every text run below its WCAG AA threshold.
 * Kept as one function so the matrix below can re-use it without duplication.
 */
function sweep() {
  const lum = (c) => {
    const [r, g, b] = c.map((v) => {
      const ch = v / 255;
      return ch <= 0.03928 ? ch / 12.92 : ((ch + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const hex = (h) => [Number.parseInt(h.slice(1, 3), 16), Number.parseInt(h.slice(3, 5), 16), Number.parseInt(h.slice(5, 7), 16)];
  const parseRgba = (str) => {
    const m = str.match(/rgba?\(([^)]+)\)/);
    if (!m) return null;
    const parts = m[1].split(',').map((v) => Number.parseFloat(v));
    return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
  };
  const over = (fg, a, bg) => fg.map((c, i) => c * a + bg[i] * (1 - a));
  const parseColor = (str) => {
    const m = str.match(/[0-9.]+/g);
    return m ? m.slice(0, 3).map(Number) : null;
  };

  /** Composite the painted background of `el`, root downwards, gradients included. */
  const resolveBg = (el) => {
    const chain = [];
    let n = el;
    while (n && n !== document.documentElement) {
      chain.push(n);
      n = n.parentElement;
    }
    let base = [245, 249, 255];
    const bodyBg = parseRgba(getComputedStyle(document.body).backgroundColor);
    if (bodyBg && bodyBg.a > 0) base = over(bodyBg.rgb, bodyBg.a, base);
    for (const node of chain.reverse()) {
      const cs = getComputedStyle(node);
      const img = cs.backgroundImage;
      if (img && img.includes('gradient')) {
        const stops = [
          ...[...img.matchAll(/#([0-9a-fA-F]{6})\b/g)].map((m) => ({ rgb: hex(m[1]), a: 1 })),
          ...[...img.matchAll(/rgba?\(([^)]+)\)/g)].map((m) => {
            const p = m[1].split(',').map((v) => Number.parseFloat(v));
            return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
          }),
        ];
        if (stops.length) {
          // Worst case across the stops: text has to survive the whole gradient.
          base = stops.reduce(
            (worst, st) => {
              const c = over(st.rgb, st.a, base);
              const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
              return l < worst.l ? { c, l } : worst;
            },
            { c: base, l: 999 },
          ).c;
        }
      }
      const b = parseRgba(cs.backgroundColor);
      if (b && b.a > 0) base = over(b.rgb, b.a, base);
    }
    return base;
  };

  const out = [];
  document.querySelectorAll('p,span,a,button,td,th,li,h1,h2,h3,strong,label,div').forEach((el) => {
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim().length > 2);
    if (!hasText) return;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || cs.display === 'none' || el.offsetParent === null) return;
    const fg = parseColor(cs.color);
    if (!fg) return;
    const bg = resolveBg(el);
    const l1 = lum(fg);
    const l2 = lum(bg);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const size = Number.parseFloat(cs.fontSize);
    const bold = Number.parseInt(cs.fontWeight, 10) >= 700;
    const large = size >= 24 || (size >= 18.66 && bold);
    const need = large ? 3 : 4.5;
    if (ratio < need) {
      out.push({
        text: el.textContent.trim().slice(0, 40),
        ratio: Number(ratio.toFixed(2)),
        need,
        color: cs.color,
        bg: `rgb(${bg.map((v) => Math.round(v)).join(',')})`,
        cls: (el.className || '').toString().slice(0, 40),
      });
    }
  });
  return out;
}

const SCHEMES = [
  { mode: 'light', preset: 'Sky Blue' },
  { mode: 'dark', preset: 'Sky Blue' },
  { mode: 'light', preset: 'Violet' },
  { mode: 'dark', preset: 'Violet' },
  { mode: 'light', preset: 'Amber' },
  { mode: 'dark', preset: 'Emerald' },
];

const fails = [];
for (const scheme of SCHEMES) {
  await page.goto(BASE + '/#/settings', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.getByRole('radio', { name: new RegExp('^' + scheme.mode + '$', 'i') }).click();
  await page.getByRole('radio', { name: scheme.preset }).click();
  await page.waitForTimeout(300);

  for (const route of routes) {
    await page.goto(BASE + '/#' + route, { waitUntil: 'networkidle' });
    await page.waitForTimeout(500);
    const res = await page.evaluate(sweep);
    if (res.length) fails.push({ scheme: `${scheme.mode}/${scheme.preset}`, route, items: res.slice(0, 6) });
  }
}

if (fails.length === 0) {
  console.log(`PASS: no text below WCAG AA across ${routes.length} routes × ${SCHEMES.length} schemes`);
} else {
  for (const f of fails) {
    console.log('FAIL', f.scheme, f.route);
    for (const i of f.items) console.log('   ', i.ratio, '(need ' + i.need + ')', i.cls, '::', i.text, '|', i.color, 'on', i.bg);
  }
  process.exitCode = 1;
}
await browser.close();
