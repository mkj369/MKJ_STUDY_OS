import { expect, test, type Page } from '@playwright/test';
import { bootWorkspace } from './onboarding';

/**
 * A small, dependency-free accessibility sweep over every route:
 *  - every button/link has an accessible name (text, aria-label or title)
 *  - every form control is associated with a label, aria-label or aria-labelledby
 *  - no image is missing alt text
 *  - each screen has exactly one h1 and a main landmark
 *
 * It is deliberately not a full WCAG audit (no contrast math, no screen-reader run);
 * those need a manual pass with assistive technology.
 */

const ROUTES = [
  '/',
  '/curriculum',
  '/subjects',
  '/syllabus',
  '/lectures',
  '/sessions',
  '/time',
  '/focus',
  '/tasks',
  '/planner',
  '/revisions',
  '/revisions/smart',
  '/difficulties',
  '/mistakes',
  '/weakness',
  '/exams',
  '/exams/prep',
  '/practice',
  '/notes',
  '/vault',
  '/reports',
  '/insights',
  '/reminders',
  '/export',
  '/settings',
];

async function boot(page: Page) {
  await bootWorkspace(page);
}

for (const route of ROUTES) {
  test(`accessible names and landmarks on ${route}`, async ({ page }) => {
    await boot(page);
    await page.goto(`/#${route}`);
    await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });

    const problems = await page.evaluate(() => {
      const labelFor = new Set(
        [...document.querySelectorAll('label[for]')].map((label) => label.getAttribute('for') ?? ''),
      );
      const name = (el: Element): string => {
        const aria = el.getAttribute('aria-label')?.trim();
        if (aria) return aria;
        const labelledBy = el.getAttribute('aria-labelledby');
        if (labelledBy) {
          const text = labelledBy
            .split(/\s+/)
            .map((id) => document.getElementById(id)?.textContent ?? '')
            .join(' ')
            .trim();
          if (text) return text;
        }
        const title = el.getAttribute('title')?.trim();
        if (title) return title;
        return (el.textContent ?? '').trim();
      };
      const issues: string[] = [];
      for (const el of document.querySelectorAll('button, a[href]')) {
        if ((el as HTMLElement).closest('[aria-hidden="true"]')) continue;
        if (!name(el) && !el.querySelector('img[alt]:not([alt=""])')) {
          issues.push(`${el.tagName.toLowerCase()} without a name: ${el.outerHTML.slice(0, 120)}`);
        }
      }
      for (const el of document.querySelectorAll('input, select, textarea')) {
        const id = el.getAttribute('id') ?? '';
        const hasLabel =
          Boolean(el.getAttribute('aria-label')) ||
          Boolean(el.getAttribute('aria-labelledby')) ||
          (id !== '' && labelFor.has(id)) ||
          Boolean(el.closest('label'));
        if (!hasLabel) issues.push(`control without a label: ${el.outerHTML.slice(0, 120)}`);
      }
      for (const img of document.querySelectorAll('img')) {
        if (!img.hasAttribute('alt')) issues.push(`img without alt: ${img.outerHTML.slice(0, 120)}`);
      }
      const mains = document.querySelectorAll('main');
      if (mains.length !== 1) issues.push(`expected exactly one main, found ${mains.length}`);
      const h1s = document.querySelectorAll('main h1');
      if (h1s.length !== 1) issues.push(`expected exactly one h1 in main, found ${h1s.length}`);
      return issues;
    });

    expect(problems, `${route}: ${problems.join('\n')}`).toEqual([]);
  });
}

test('icons render from inline SVG instead of a runtime fetch', async ({ page }) => {
  await boot(page);
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible();
  await page.waitForTimeout(300);
  const icons = await page.evaluate(() => {
    const elements = [...document.querySelectorAll('ion-icon')];
    return {
      total: elements.length,
      rendered: elements.filter((el) => (el.shadowRoot?.innerHTML ?? '').includes('<svg')).length,
    };
  });
  // A bare icon *name* makes Ionic try to download the SVG; in this build the icons
  // are data URIs, so every icon must have its SVG without any network request.
  expect(icons.total).toBeGreaterThan(10);
  expect(icons.rendered).toBe(icons.total);
});
