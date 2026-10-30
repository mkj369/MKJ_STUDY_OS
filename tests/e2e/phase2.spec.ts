import { expect, test, type Page } from '@playwright/test';
import { bootWorkspace } from './onboarding';

/* Onboarding is answered by the shared helper, exactly as a student would. */
async function bootLocalWorkspace(page: Page) {
  await bootWorkspace(page);
}

const ROUTES: { path: string; heading: string | RegExp }[] = [
  { path: '/syllabus', heading: 'Syllabus tracker' },
  { path: '/time', heading: 'Daily time tracker' },
  { path: '/planner', heading: 'Smart planner' },
  { path: '/revisions/smart', heading: 'Smart revision' },
  { path: '/weakness', heading: 'Weakness analyzer' },
  { path: '/exams/prep', heading: 'Exam preparation' },
  { path: '/practice', heading: 'Question practice' },
  { path: '/vault', heading: 'Formula vault' },
  { path: '/insights', heading: 'Progress insights' },
  { path: '/focus', heading: 'Focus' },
  { path: '/export', heading: 'Export & academic history' },
];

test('every phase-2 route renders and none shows a load error', async ({ page }) => {
  await bootLocalWorkspace(page);

  for (const route of ROUTES) {
    await page.goto(`/#${route.path}`);
    await expect(page.getByRole('main').getByRole('heading', { level: 1, name: route.heading })).toBeVisible({ timeout: 20_000 });
    await expect(page.getByText('Could not load your records')).toHaveCount(0);
  }
});

test('a time block can be recorded and appears on the timeline', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/time');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Daily time tracker' })).toBeVisible();

  await page.getByRole('button', { name: /add time block/i }).click();
  await page.getByLabel('Category', { exact: true }).selectOption('college');
  await page.getByLabel('Duration (minutes)', { exact: true }).fill('45');
  await page.getByRole('button', { name: 'Add block', exact: true }).click();

  await expect(page.getByText('45m').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/College/).first()).toBeVisible();

  // The same domain rule holds in the totals: a college block is "other" time,
  // so 45 minutes of it must never be counted as study time.
  const stats = page.locator('.grid--stats .stat');
  await expect(stats.filter({ hasText: 'Study this week' })).toContainText('0m');
  await expect(stats.filter({ hasText: 'Other time' })).toContainText('45m');
});

test('a practice question can be created, attempted and graded', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/practice');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Question practice' })).toBeVisible();

  await page.getByRole('button', { name: /add question/i }).click();
  await page.getByLabel('Question', { exact: true }).fill('What is the SI unit of force?');
  await page.getByLabel(/Expected answer/).fill('Newton');
  await page.getByRole('button', { name: 'Add question', exact: true }).last().click();
  await expect(page.getByText('What is the SI unit of force?').first()).toBeVisible({ timeout: 20_000 });

  await page
    .locator('.list-row', { hasText: 'What is the SI unit of force?' })
    .getByRole('button', { name: /record attempt/i })
    .first()
    .click();
  await page.getByLabel('Was it correct?', { exact: true }).check();
  await page.getByRole('button', { name: /save attempt/i }).click();
  await expect(page.getByText(/100%/).first()).toBeVisible({ timeout: 20_000 });
});

test('focus timer starts, pauses, resumes and keeps its state across navigation', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/focus');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Focus' })).toBeVisible();

  // Start, then pause: the clock must hold while paused (paused time is not study time).
  await page.getByRole('button', { name: /start focus/i }).click();
  await expect(page.getByRole('button', { name: /^pause$/i })).toBeVisible();
  await page.waitForTimeout(2100);
  await page.getByRole('button', { name: /^pause$/i }).click();
  const paused = await page.locator('.focus-stage__time').textContent();
  await page.waitForTimeout(1500);
  expect(await page.locator('.focus-stage__time').textContent()).toBe(paused);

  // Resume, leave the screen and come back: the running timer is restored.
  await page.getByRole('button', { name: /^resume$/i }).click();
  await page.goto('/#/tasks');
  await page.waitForTimeout(1200);
  await page.goto('/#/focus');
  await expect(page.getByRole('button', { name: /^pause$/i })).toBeVisible({ timeout: 20_000 });

  // Ending is allowed once a minute is recorded; the button reports why not before that.
  await expect(page.getByRole('button', { name: /end session/i })).toBeVisible();
});

test('Study Circle states what is not built yet instead of faking a community', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/focus');
  await page.getByRole('tab', { name: /study circle/i }).click();
  await expect(page.getByRole('main').getByText(/Study together\. Stay consistent\./)).toBeVisible();
  await expect(page.getByRole('main').getByText(/Coming soon/).first()).toBeVisible();
  // No invented students or scores: the leaderboard rows are explicitly empty.
  await expect(page.getByText(/No online data yet/).first()).toBeVisible();
  await expect(page.getByRole('main').getByText(/Online study rooms and the global leaderboard are planned/i)).toBeVisible();
});
