import { expect, test } from '@playwright/test';
import { bootWorkspace } from './onboarding';

/**
 * Classes 1–8 have no official chapter list loaded, so this suite walks the
 * path a Class 6 student actually takes: build the subject from a suggestion,
 * number three chapters, tick one off, rename and reorder, then change class
 * and come back. Every assertion is about saved data, not about a screen
 * rendering something.
 */

test('a Class 6 student builds a custom curriculum and it survives edits, reload and a class change', async ({
  page,
}) => {
  await bootWorkspace(page, { classLevel: 6 });
  await page.goto('/#/curriculum');

  // No official list: the page says so and offers a way forward.
  await expect(page.getByRole('heading', { level: 2, name: 'Class 6' })).toBeVisible();
  await expect(page.locator('.subject-card')).toHaveCount(0);

  // Onboarding never asked for a group at primary level.
  await page.getByRole('button', { name: /^Add subject$/ }).first().click();
  const library = page.getByRole('dialog');
  await expect(library.getByText(/no official subject list is loaded for class 6/i).first()).toBeVisible();
  await library.getByRole('button', { name: 'Mathematics', exact: true }).click();

  const form = page.getByRole('dialog');
  await expect(form.getByLabel('Subject name')).toHaveValue('Mathematics');
  await form.getByLabel(/Bengali name/i).fill('গণিত');
  await form.getByRole('radio', { name: /colour #8a50f5/i }).click();
  await form.getByRole('button', { name: /save subject/i }).click();
  await expect(form).toBeHidden({ timeout: 20_000 });

  const card = page.locator('.subject-card').filter({ hasText: 'Mathematics' }).first();
  await expect(card).toBeVisible();
  await expect(card).toContainText('গণিত');

  // Three chapters, numbered automatically, from one dialog.
  await card.getByRole('button', { name: /^Add chapter$/ }).click();
  const chapterDialog = page.getByRole('dialog');
  await chapterDialog.getByRole('radio', { name: /add several/i }).click();
  await chapterDialog.getByLabel(/how many chapters/i).fill('3');
  await chapterDialog.getByRole('button', { name: /^Add 3 chapters$/ }).click();
  await expect(chapterDialog).toBeHidden({ timeout: 20_000 });

  await card.getByRole('button', { name: /open chapters/i }).click();
  const rows = page.locator('.chapter-row');
  await expect(rows).toHaveCount(3);
  await expect(rows.nth(0)).toContainText('Chapter 1');
  await expect(rows.nth(2)).toContainText('Chapter 3');

  // Tick the first chapter complete, then rename and move it.
  await card.getByRole('button', { name: /^Mark Chapter 1 done$/ }).click();
  await expect(card.getByRole('button', { name: /^Mark Chapter 1 not done$/ })).toBeVisible({ timeout: 20_000 });

  await rows.nth(0).getByRole('button', { name: /rename chapter 1/i }).click();
  await card.getByLabel('Title', { exact: true }).first().fill('Fractions');
  await card.getByRole('button', { name: /^save$/i }).click();
  await expect(page.locator('.chapter-row').filter({ hasText: 'Fractions' })).toHaveCount(1);
  await expect(card.getByRole('button', { name: /^Mark Fractions not done$/ })).toBeVisible();

  await page.locator('.chapter-row').filter({ hasText: 'Fractions' }).getByRole('button', { name: /rename/i }).click();
  await card.getByRole('button', { name: /move down/i }).click();
  await expect(page.locator('.chapter-row').nth(1)).toContainText('Fractions');

  // The card's own count is derived from the checklist, not from a click.
  await expect(card).toContainText('1 completed');

  // Reload: it was stored, not just rendered.
  await page.reload();
  const reloaded = page.locator('.subject-card').filter({ hasText: 'Mathematics' }).first();
  await expect(reloaded).toBeVisible({ timeout: 20_000 });
  await expect(reloaded).toContainText('1 completed');
  await reloaded.getByRole('button', { name: /open chapters/i }).click();
  await expect(page.locator('.chapter-row')).toHaveCount(3);
  // Moving "Fractions" down put Chapter 2 first: the order was saved, not renumbered away.
  await expect(page.locator('.chapter-row').nth(0)).toContainText('Chapter 2');
  await expect(page.locator('.chapter-row').nth(1)).toContainText('Fractions');

  // Change class and come back: the Class 6 rows are untouched.
  await page.goto('/#/settings');
  await page.getByRole('main').getByRole('button', { name: '10', exact: true }).click();
  await expect(page.getByText(/Showing Class 10/i).first()).toBeVisible({ timeout: 20_000 });
  await page.goto('/#/curriculum');
  await expect(page.locator('.subject-card')).toHaveCount(0);

  await page.goto('/#/settings');
  await page.getByRole('main').getByRole('button', { name: '6', exact: true }).click();
  await expect(page.getByText(/Showing Class 6/i).first()).toBeVisible({ timeout: 20_000 });
  await page.goto('/#/curriculum');
  const restored = page.locator('.subject-card').filter({ hasText: 'Mathematics' }).first();
  await expect(restored).toBeVisible();
  await expect(restored).toContainText('1 completed');
  await expect(restored).toContainText('গণিত');
});

test('the workspace totals follow the active class instead of adding classes together', async ({ page }) => {
  await bootWorkspace(page, { classLevel: 6 });
  await page.goto('/#/curriculum');
  await page.getByRole('button', { name: /^Add subject$/ }).first().click();
  const library = page.getByRole('dialog');
  await library.getByRole('button', { name: 'English', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByRole('button', { name: /save subject/i }).click();
  await expect(form).toBeHidden({ timeout: 20_000 });

  const card = page.locator('.subject-card').filter({ hasText: 'English' }).first();
  await card.getByRole('button', { name: /^Add chapter$/ }).click();
  const chapterDialog = page.getByRole('dialog');
  await chapterDialog.getByRole('radio', { name: /add several/i }).click();
  await chapterDialog.getByLabel(/how many chapters/i).fill('2');
  await chapterDialog.getByRole('button', { name: /^Add 2 chapters$/ }).click();
  await expect(chapterDialog).toBeHidden({ timeout: 20_000 });

  // The curriculum header counts only what this class owns.
  await expect(page.getByText(/2 chapters/i).first()).toBeVisible();

  // In Class 10 nothing from Class 6 leaks into the header counts.
  await page.goto('/#/settings');
  await page.getByRole('main').getByRole('button', { name: '10', exact: true }).click();
  await expect(page.getByText(/Showing Class 10/i).first()).toBeVisible({ timeout: 20_000 });
  await page.goto('/#/curriculum');
  await expect(page.getByRole('heading', { level: 1, name: 'My Curriculum' })).toBeVisible();
  await expect(page.locator('.subject-card')).toHaveCount(0);
});

test('a Class 6 session stops counting in Class 10 totals and returns when the class is restored', async ({
  page,
}) => {
  await bootWorkspace(page, { classLevel: 6 });
  await page.goto('/#/curriculum');
  await page.getByRole('button', { name: /^Add subject$/ }).first().click();
  const library = page.getByRole('dialog');
  await library.getByRole('button', { name: 'Science', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByRole('button', { name: /save subject/i }).click();
  await expect(form).toBeHidden({ timeout: 20_000 });

  // Log 45 minutes against that subject.
  await page.goto('/#/sessions');
  await page.getByRole('button', { name: /log session/i }).first().click();
  // RecordDialog renders an IonModal, which does not expose role="dialog", so
  // fields are addressed by label directly (the pattern the other suites use).
  await page.getByLabel('Subject', { exact: true }).selectOption({ label: 'Science' });
  await page.getByLabel(/Duration \(minutes\)/i).fill('45');
  await page.getByRole('button', { name: /^Log session$/ }).last().click();
  await expect(page.getByLabel('Subject', { exact: true })).toBeHidden({ timeout: 20_000 });
  await expect(page.getByText(/45 min|0h 45m|45m/).first()).toBeVisible({ timeout: 20_000 });

  // The tracker counts it while Class 6 is active.
  await page.goto('/#/time');
  await expect(page.getByText(/45/).first()).toBeVisible({ timeout: 20_000 });

  // In Class 10 the same session is out of scope: totals are recomputed, not
  // just hidden from a list.
  await page.goto('/#/settings');
  await page.getByRole('main').getByRole('button', { name: '10', exact: true }).click();
  await expect(page.getByText(/Showing Class 10/i).first()).toBeVisible({ timeout: 20_000 });
  await page.goto('/#/time');
  const class10Body = await page.getByRole('main').innerText();
  expect(class10Body).not.toMatch(/45 min|0h 45m/);

  // Back in Class 6 the minutes are exactly where they were.
  await page.goto('/#/settings');
  await page.getByRole('main').getByRole('button', { name: '6', exact: true }).click();
  await expect(page.getByText(/Showing Class 6/i).first()).toBeVisible({ timeout: 20_000 });
  await page.goto('/#/time');
  await expect(page.getByText(/45/).first()).toBeVisible({ timeout: 20_000 });
});
