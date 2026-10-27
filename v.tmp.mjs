import { chromium } from 'playwright-core';
import { chromiumExecutablePath, chromiumEnv } from './scripts/playwright-browser.mjs';
const b = await chromium.launch({ executablePath: await chromiumExecutablePath(), args: ['--no-sandbox'], env: chromiumEnv() });
const page = await b.newPage({ viewport: { width: 1440, height: 900 } });
const errs = [];
page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text().slice(0, 140)); });
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 140)));
await page.goto('http://127.0.0.1:5173/', { waitUntil: 'domcontentloaded' });
await page.getByRole('button', { name: /start local workspace/i }).click();
await page.waitForTimeout(2500);
await page.goto('http://127.0.0.1:5173/#/reports', { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
const gaps = await page.evaluate(() => [...document.querySelectorAll('.report-list')][1]?.querySelectorAll('li').length
  ? [...[...document.querySelectorAll('.report-list')][1].querySelectorAll('li')].map(li => li.querySelector('strong')?.textContent?.trim())
  : []);
console.log('gap labels:', JSON.stringify(gaps, null, 0));
console.log('console errors:', errs.length ? errs : 'none');
await b.close();
