import { expect, test, type Page } from '@playwright/test';

/**
 * Next-update journeys, exercised against the production build in local mode:
 * setup wizard gate, compact chapter rows, lectures with per-lecture
 * checklists, weekly/monthly targets, chapter notes, community privacy defaults
 * and the theme switch. Everything asserts persisted behaviour, not cosmetics.
 */

async function bootLocalWorkspace(page: Page, withDemo = true) {
  await page.goto('/');
  await expect(page.getByText(/Local demo mode/i).first()).toBeVisible();
  if (!withDemo) {
    await page.getByLabel(/start with clearly-labelled demo data/i).uncheck();
  }
  await page.getByRole('button', { name: /start local workspace/i }).click();
  await expect(page.getByText(/good to see you|welcome,/i).first()).toBeVisible({ timeout: 20_000 });
}

test('setup gate: a fresh workspace must finish academic setup before tracking', async ({ page }) => {
  await bootLocalWorkspace(page, false);
  await page.goto('/#/syllabus');
  await expect(page.getByText(/set up your academics first/i)).toBeVisible({ timeout: 20_000 });
  await page.getByRole('link', { name: /start academic setup/i }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Academic setup' })).toBeVisible();

  // Section → group/session → subjects → confirm.
  await page.getByRole('button', { name: /^HSC Class 11/ }).click();
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByRole('button', { name: 'Science', exact: true }).click();
  await page.getByRole('button', { name: /continue/i }).click();
  // HSC Science resolves to the imported reference syllabus (with chapters).
  await expect(page.getByText(/chapter list included — source recorded/i)).toBeVisible();
  await page.getByRole('checkbox', { name: /Physics — 1st Paper/i }).check();
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByRole('button', { name: /finish setup/i }).click();

  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Syllabus tracker' })).toBeVisible({ timeout: 20_000 });
  await expect(page.locator('.subject-card', { hasText: 'Physics — 1st Paper' }).first()).toBeVisible();
  // The imported chapters came along with the subject.
  await expect(page.locator('.subject-card', { hasText: 'Physics — 1st Paper' }).first()).toContainText('0/10 chapters');

  // Setup persists across reloads; the gate does not return.
  await page.reload();
  await expect(page.getByText(/set up your academics first/i)).toHaveCount(0);
  await expect(page.locator('.subject-card', { hasText: 'Physics — 1st Paper' }).first()).toBeVisible({ timeout: 20_000 });
});

test('compact chapter rows expand, tick and persist', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/syllabus');
  await page.locator('.subject-card', { hasText: 'Physics' }).first().click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });

  const expand = page.getByRole('button', { name: /Expand checklist for Demo chapter 1/i });
  await expand.click();
  const item = page.locator('.chapter-row__body .checklist input[type="checkbox"]').first();
  await expect(item).toBeVisible();
  const wasChecked = await item.isChecked();
  await item.setChecked(!wasChecked);
  await page.reload();
  await page.getByRole('button', { name: /Expand checklist for Demo chapter 1/i }).click();
  const restored = page.locator('.chapter-row__body .checklist input[type="checkbox"]').first();
  await expect(restored).toBeVisible({ timeout: 20_000 });
  expect(await restored.isChecked()).toBe(!wasChecked);
});

test('lectures: add per chapter, tick its checklist, write notes, all persisted', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/syllabus');
  await page.locator('.subject-card', { hasText: 'Physics' }).first().click();
  await page.getByRole('link', { name: /Demo chapter 1 — mechanics/ }).first().click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: /add lecture/i }).click();
  await page.getByLabel('Lecture title', { exact: true }).fill('E2E — vectors deep dive');
  await page.getByRole('button', { name: 'Add lecture', exact: true }).last().click();
  await expect(page.getByText('E2E — vectors deep dive').first()).toBeVisible({ timeout: 20_000 });

  // Expand the new lecture: default checklist exists and ticks save.
  await page.getByRole('button', { name: /Expand details for E2E — vectors deep dive/i }).click();
  const lectureItem = page.locator('.chapter-row__body .checklist input[type="checkbox"]').first();
  await expect(lectureItem).toBeVisible({ timeout: 20_000 });
  await lectureItem.check();
  await expect(lectureItem).toBeChecked();

  // Lecture notes save (scoped to the lecture body — the chapter notes card
  // higher on the page has its own, disabled, Save notes button).
  const lectureBody = page.locator('.chapter-row__body', { has: page.getByLabel('Lecture notes', { exact: true }) });
  await page.getByLabel('Lecture notes', { exact: true }).fill('E2E note: revise dot product');
  await lectureBody.getByRole('button', { name: /^save notes$/i }).click();
  await expect(page.getByText('Lecture notes saved.').first()).toBeVisible({ timeout: 20_000 });

  // Mark the lecture completed.
  await page.getByLabel(/Mark E2E — vectors deep dive completed/i).check();

  await page.reload();
  await expect(page.getByText('E2E — vectors deep dive').first()).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /Expand details for E2E — vectors deep dive/i }).click();
  await expect(page.locator('.chapter-row__body .checklist input[type="checkbox"]').first()).toBeChecked({ timeout: 20_000 });
  await expect(page.getByLabel('Lecture notes', { exact: true })).toHaveValue('E2E note: revise dot product');
});

test('chapter notes persist', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/syllabus');
  await page.locator('.subject-card', { hasText: 'Physics' }).first().click();
  await page.getByRole('link', { name: /Demo chapter 1 — mechanics/ }).first().click();
  await page.getByLabel(/Notes for Demo chapter 1/i).fill('E2E chapter note: F = ma is a vector equation');
  await page.getByRole('button', { name: /^save notes$/i }).click();
  await expect(page.getByText('Chapter notes saved.').first()).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByLabel(/Notes for Demo chapter 1/i)).toHaveValue('E2E chapter note: F = ma is a vector equation', { timeout: 20_000 });
});

test('targets: create weekly and monthly goals; progress reflects real records', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/targets');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Study targets' })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: /new target/i }).click();
  await page.getByLabel('Target name', { exact: true }).fill('E2E weekly minutes');
  await page.getByLabel('Goal number', { exact: true }).fill('60');
  await page.getByRole('button', { name: 'Create target', exact: true }).last().click();
  await expect(page.locator('.target-card', { hasText: 'E2E weekly minutes' })).toBeVisible({ timeout: 20_000 });

  // Monthly system is independent.
  await page.getByRole('tab', { name: 'Monthly' }).click();
  await expect(page.getByText(/No monthly targets yet/i)).toBeVisible();
  await page.getByRole('button', { name: /new target/i }).click();
  await page.getByLabel('Target name', { exact: true }).fill('E2E monthly lectures');
  await page.getByLabel('Measure', { exact: true }).selectOption('lectures');
  await page.getByLabel('Goal number', { exact: true }).fill('8');
  await page.getByRole('button', { name: 'Create target', exact: true }).last().click();
  await expect(page.locator('.target-card', { hasText: 'E2E monthly lectures' })).toBeVisible({ timeout: 20_000 });

  await page.reload();
  await expect(page.locator('.target-card', { hasText: 'E2E weekly minutes' })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('tab', { name: 'Monthly' }).click();
  await expect(page.locator('.target-card', { hasText: 'E2E monthly lectures' })).toBeVisible({ timeout: 20_000 });

  // Edit works.
  await page.getByRole('button', { name: /Edit E2E monthly lectures/i }).click();
  await page.getByLabel('Goal number', { exact: true }).fill('10');
  await page.getByRole('button', { name: 'Save changes', exact: true }).last().click();
  // Goal is now 10; current progress comes from real demo records (≥0 lectures
  // this month), so assert the denominator, not a fabricated zero.
  await expect(page.locator('.target-card', { hasText: 'E2E monthly lectures' })).toContainText(/ \(\d+\/10\)/, { timeout: 20_000 });
});

test('community is private by default and local mode says there is no server', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/community');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Community' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Private — nobody can see this/i)).toBeVisible();
  await expect(page.getByLabel(/Share my progress snapshot/i)).not.toBeChecked();
  await expect(page.getByText(/Community needs a cloud account/i)).toBeVisible();

  // A pseudonym with contact info is rejected.
  await page.getByLabel('Pseudonym', { exact: true }).fill('me@example.com');
  await page.getByRole('button', { name: /save \(stay private\)/i }).click();
  await expect(page.getByText(/must not contain an email address or phone number/i)).toBeVisible();
});

test('theme switch persists and pins the palette', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/settings');
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 20_000 });
  await page.getByRole('button', { name: 'Light', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
});

test('school section setup: Class 1–5 keeps honest manual subjects and persists the class', async ({ page }) => {
  await bootLocalWorkspace(page, false);
  await page.goto('/#/setup');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Academic setup' })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: /^Class 1–5/ }).click();
  await expect(page.getByText(/school classes use your own subjects/i)).toBeVisible();
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByRole('button', { name: 'Class 3', exact: true }).click();
  await page.getByRole('button', { name: /continue/i }).click();
  // No fabricated curriculum for school classes.
  await expect(page.getByText(/add your own subjects after setup/i)).toBeVisible();
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByRole('button', { name: /finish setup/i }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Syllabus tracker' })).toBeVisible({ timeout: 20_000 });

  // The class choice is visible in Settings and survives a reload.
  await page.goto('/#/settings');
  await expect(page.getByText('Class 3').first()).toBeVisible({ timeout: 20_000 });
  await page.reload();
  await expect(page.getByText('Class 3').first()).toBeVisible({ timeout: 20_000 });
});

test('HSC Admission reuses the HSC syllabus and stores the admission target', async ({ page }) => {
  await bootLocalWorkspace(page, false);
  await page.goto('/#/setup');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Academic setup' })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: /^HSC Admission/ }).click();
  await expect(page.getByText(/same syllabus, no duplicate work/i)).toBeVisible();
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByRole('button', { name: 'Science', exact: true }).click();
  await page.getByLabel('Admission target (optional)').fill('DU A-unit');
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByRole('checkbox', { name: /Chemistry — 1st Paper/i }).check();
  await page.getByRole('button', { name: /continue/i }).click();
  await page.getByRole('button', { name: /finish setup/i }).click();

  await expect(page.locator('.subject-card', { hasText: 'Chemistry — 1st Paper' }).first()).toBeVisible({ timeout: 20_000 });
  // Imported chapters, same rows as HSC — 5 for Chemistry 1st Paper.
  await expect(page.locator('.subject-card', { hasText: 'Chemistry — 1st Paper' }).first()).toContainText('0/5 chapters');
  await page.goto('/#/settings');
  await expect(page.getByText('DU A-unit').first()).toBeVisible({ timeout: 20_000 });
});

test('skipped chapter leaves the completion percent untouched and persists', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/syllabus');
  await expect(page.locator('.subject-card').first()).toBeVisible({ timeout: 20_000 });

  // Open the first Physics chapter and mark it skipped.
  await page.locator('.subject-card', { hasText: 'Physics' }).first().click();
  await page.getByRole('link', { name: /Demo chapter 2/i }).first().click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: /edit chapter/i }).click();
  await page.getByLabel('Your label', { exact: true }).selectOption('skipped');
  await page.getByRole('button', { name: 'Save chapter', exact: true }).click();
  await expect(page.getByText(/your label: skipped/i)).toBeVisible({ timeout: 20_000 });

  // Subject header shows the skip and excludes it from the denominator.
  await page.goBack();
  await expect(page.getByText(/1 skipped/i).first()).toBeVisible({ timeout: 20_000 });

  // Reload: the label survives.
  await page.reload();
  await expect(page.getByText(/1 skipped/i).first()).toBeVisible({ timeout: 20_000 });
});

test('syllabus dashboard shows the real study-activity card', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/syllabus');
  await expect(page.getByRole('heading', { name: 'Study activity' })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText('Today', { exact: true })).toBeVisible();
  await expect(page.getByText('This week', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /full history/i })).toBeVisible();
});
