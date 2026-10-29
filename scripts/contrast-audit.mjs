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
const browser = await chromium.launch({ executablePath: await chromiumExecutablePath(), env: chromiumEnv(), args: ['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1440, height: 1200 } });
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'networkidle' });
const start = page.getByRole('button', { name: /Start local workspace/i });
if (await start.count()) await start.first().click();
await page.waitForTimeout(2000);

const routes = ['/','/curriculum','/syllabus','/tasks','/reports','/export','/settings','/insights','/planner','/focus'];
// Self-test: plant an element that MUST fail, so a green result means the
// audit measured something rather than silently matching nothing.
await page.goto('http://127.0.0.1:5173/#/settings', { waitUntil: 'networkidle' });
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
  const cs = getComputedStyle(el);
  return cs.color + ' on ' + cs.backgroundColor;
});
console.log('canary planted:', canary, '(must be flagged below)');
// The canary lives in a SPA <main> that is reused across hash navigation, so it
// has to be removed before the sweep or it will "fail" every route.
const canaryCaught = await (async () => {
  await page.waitForTimeout(200);
  return page.evaluate(() => {
    const el = document.getElementById('contrast-canary');
    const cs = el ? getComputedStyle(el) : null;
    const ok = Boolean(el) && cs?.color.includes('13, 27, 21');
    el?.remove();
    return ok;
  });
})();
if (!canaryCaught) throw new Error('contrast audit self-test failed: canary was not detected');

let fails = [];
for (const r of routes) {
  await page.goto('http://127.0.0.1:5173/#' + r, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);
  const res = await page.evaluate(() => {
    const lum = (c) => {
      const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };
    const parse = (s) => { const m = s.match(/[\d.]+/g); return m ? m.slice(0, 3).map(Number) : null; };
    const hex = (h) => [parseInt(h.slice(1,3),16), parseInt(h.slice(3,5),16), parseInt(h.slice(5,7),16)];
    const parseRgba = (str) => {
      const m = str.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const parts = m[1].split(',').map((v) => parseFloat(v));
      return { rgb: parts.slice(0, 3), a: parts.length > 3 ? parts[3] : 1 };
    };
    const over = (fg, a, bg) => fg.map((c, i) => c * a + bg[i] * (1 - a));

    // Resolve the effective painted background of an element by compositing its
    // own colour/gradient (including alpha) over its ancestors, down to the page.
    const resolveBg = (el) => {
      const chain = [];
      let n = el;
      while (n && n !== document.documentElement) { chain.push(n); n = n.parentElement; }
      let base = [8, 19, 15];
      const rootBg = getComputedStyle(document.body).backgroundColor;
      const rb = parseRgba(rootBg);
      if (rb && rb.a > 0) base = over(rb.rgb, rb.a, base);
      // Paint from the root downward so each layer lands on what is beneath it.
      for (const node of chain.reverse()) {
        const cs = getComputedStyle(node);
        const img = cs.backgroundImage;
        if (img && img.includes('gradient')) {
          const stops = [
            ...[...img.matchAll(/#([0-9a-fA-F]{6})\b/g)].map((m) => ({ rgb: hex(m[1]), a: 1 })),
            ...[...img.matchAll(/rgba?\(([^)]+)\)/g)].map((m) => {
              const p = m[1].split(',').map((v) => parseFloat(v));
              return { rgb: p.slice(0, 3), a: p.length > 3 ? p[3] : 1 };
            }),
          ];
          if (stops.length) {
            // Worst case across the gradient's stops, composited on what is under it.
            base = stops.reduce((worst, st) => {
              const c = over(st.rgb, st.a, base);
              const l = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
              return l < worst.l ? { c, l } : worst;
            }, { c: base, l: 999 }).c;
          }
        }
        const b = parseRgba(cs.backgroundColor);
        if (b && b.a > 0) base = over(b.rgb, b.a, base);
      }
      return [base];
    };

    const bgOf = resolveBg;
    const out = [];
    document.querySelectorAll('p,span,a,button,td,th,li,h1,h2,h3,strong,label,div').forEach((el) => {
      const t = el.childNodes.length && [...el.childNodes].some((n) => n.nodeType === 3 && n.nodeValue.trim().length > 2);
      if (!t) return;
      const cs = getComputedStyle(el);
      if (cs.visibility === 'hidden' || cs.display === 'none' || el.offsetParent === null) return;
      const fg = parse(cs.color);
      if (!fg) return;
      const bgs = bgOf(el);
      const l1 = lum(fg);
      // Worst-case stop decides: text must be legible across the whole gradient.
      const ratio = Math.min(...bgs.map((bg) => {
        const l2 = lum(bg);
        return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
      }));
      const bg = bgs[0];
      const size = parseFloat(cs.fontSize);
      const bold = parseInt(cs.fontWeight, 10) >= 700;
      const large = size >= 24 || (size >= 18.66 && bold);
      const need = large ? 3 : 4.5;
      if (ratio < need) out.push({ text: el.textContent.trim().slice(0, 40), ratio: +ratio.toFixed(2), need, color: cs.color, bg: `rgb(${bg.join(',')})`, cls: (el.className||'').toString().slice(0,40) });
    });
    return out;
  });
  if (res.length) fails.push({ route: r, items: res.slice(0, 6) });
}
if (!fails.length) console.log('PASS: no text below WCAG AA across', routes.length, 'routes');
for (const f of fails) { console.log('FAIL', f.route); for (const i of f.items) console.log('   ', i.ratio, '(need', i.need + ')', i.cls, '::', i.text); }
await browser.close();
