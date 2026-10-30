import { expect, test } from '@playwright/test';
import { bootWorkspace } from './onboarding';

/**
 * The curriculum acceptance path, driven through the browser.
 *
 * These are the steps a student actually takes: choose a class, see the subjects
 * that apply to it, add several at once, then change class and come back. The
 * point of each assertion is that the data is real and stays put — not that a
 * component rendered.
 */

test('a Class 12 Science student can add several applicable subjects in one go', async ({ page }) => {
  await bootWorkspace(page, { classLevel: 12, group: 'Science' });
  await page.goto('/#/curriculum');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'My Curriculum' })).toBeVisible();

  await page.getByRole('button', { name: /^Add subject$/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  // HSC Science is on file: physics, chemistry and the rest are offered by name.
  await expect(dialog.getByRole('checkbox', { name: /^Physics 1st Paper$/ })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /^Chemistry 2nd Paper$/ })).toBeVisible();
  /*
   * The whole HSC Science structure, not a hand-picked few: three common
   * subjects, four group subjects, and second papers for all of them, minus
   * the ones already adopted in this workspace. Counting is the point — a
   * short list would silently look complete.
   */
  await expect(dialog.getByRole('checkbox')).toHaveCount(13);
  await expect(dialog.getByRole('checkbox', { name: /^Bangla 2nd Paper$/ })).toBeVisible();
  await expect(dialog.getByRole('checkbox', { name: /^Biology 2nd Paper$/ })).toBeVisible();

  await dialog.getByRole('checkbox', { name: /^Physics 2nd Paper$/ }).check();
  await dialog.getByRole('checkbox', { name: /^Chemistry 1st Paper$/ }).check();
  await dialog.getByRole('button', { name: /Add 2 subjects/ }).click();
  await expect(dialog).toBeHidden({ timeout: 20_000 });

  const cards = page.locator('.subject-card');
  await expect(cards.filter({ hasText: 'Physics' })).toHaveCount(1);
  await expect(cards.filter({ hasText: 'Chemistry' })).toHaveCount(1);

  // The adopted Physics paper brought its real 15 chapters with it.
  await cards.filter({ hasText: 'Physics' }).getByRole('button', { name: /open chapters/i }).click();
  await expect(page.locator('.chapter-row')).toHaveCount(15);

  // …and the same rows are there after a reload: it was saved, not rendered.
  await page.reload();
  await expect(page.locator('.subject-card').filter({ hasText: 'Physics' })).toHaveCount(1, { timeout: 20_000 });
});

test('adding chapters generates numbered rows that survive a rename', async ({ page }) => {
  await bootWorkspace(page, { classLevel: 12, group: 'Science' });
  await page.goto('/#/curriculum');

  await page.getByRole('button', { name: /^Add subject$/ }).first().click();
  const library = page.getByRole('dialog');
  await library.getByRole('button', { name: /custom subject/i }).click();
  const custom = page.getByRole('dialog');
  await custom.getByLabel('Subject name').fill('Higher Mathematics');
  await custom.getByLabel(/Bengali name/i).fill('উচ্চতর গণিত');
  await custom.getByRole('button', { name: /save subject/i }).click();
  await expect(custom).toBeHidden({ timeout: 20_000 });

  const card = page.locator('.subject-card').filter({ hasText: 'Higher Mathematics' }).first();
  await expect(card).toBeVisible();
  await card.getByRole('button', { name: /^Add chapter$/ }).click();
  const chapterDialog = page.getByRole('dialog');
  await expect(chapterDialog.getByRole('radio', { name: /add several/i })).toBeVisible();
  await chapterDialog.getByRole('radio', { name: /add several/i }).click();
  await chapterDialog.getByLabel(/how many chapters/i).fill('4');
  await chapterDialog.getByRole('button', { name: /^Add 4 chapters$/ }).click();
  await expect(chapterDialog).toBeHidden({ timeout: 20_000 });

  await card.getByRole('button', { name: /open chapters/i }).click();
  const rows = page.locator('.chapter-row');
  await expect(rows).toHaveCount(4);
  await expect(rows.nth(0)).toContainText('Chapter 1');
  await expect(rows.nth(3)).toContainText('Chapter 4');

  // Rename in place: same row, new title. Nothing is deleted and recreated.
  await rows.nth(0).getByRole('button', { name: /rename chapter 1/i }).click();
  const titleField = card.getByLabel('Title', { exact: true }).first();
  await titleField.fill('Vectors');
  await card.getByRole('button', { name: /^save$/i }).click();
  await expect(page.locator('.chapter-row').filter({ hasText: 'Vectors' })).toHaveCount(1);
  await expect(page.locator('.chapter-row')).toHaveCount(4);
});

test('changing class keeps every record and shows the other class on return', async ({ page }) => {
  await bootWorkspace(page, { classLevel: 11, group: 'Science' });
  await page.goto('/#/curriculum');
  await expect(page.locator('.subject-card').first()).toBeVisible();
  const demoCards = await page.locator('.subject-card').count();
  expect(demoCards).toBeGreaterThan(0);

  // Switch to Class 10 in Settings.
  await page.goto('/#/settings');
  const classSection = page.getByRole('main');
  await classSection.getByRole('button', { name: '10', exact: true }).click();
  await expect(page.getByText(/Showing Class 10/i).first()).toBeVisible({ timeout: 20_000 });

  await page.goto('/#/curriculum');
  await expect(page.getByRole('heading', { level: 2, name: 'Class 10' })).toBeVisible();
  // The Class 11 rows are not relabelled, copied or deleted — just out of scope.
  await expect(page.locator('.subject-card')).toHaveCount(0);
  await expect(page.getByText(/No subjects yet/i).first()).toBeVisible();

  // Switch back: everything is exactly where it was.
  await page.goto('/#/settings');
  await page.getByRole('main').getByRole('button', { name: '11', exact: true }).click();
  await expect(page.getByText(/Showing Class 11/i).first()).toBeVisible({ timeout: 20_000 });
  await page.goto('/#/curriculum');
  await expect(page.locator('.subject-card')).toHaveCount(demoCards);
});

test('the Add subjects dialog fits a 390px phone without sideways scroll', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await bootWorkspace(page, { classLevel: 11, group: 'Science' });
  await page.goto('/#/curriculum');
  await page.getByRole('button', { name: /^Add subject$/ }).first().click();
  const dialog = page.getByRole('dialog');
  await expect(dialog).toBeVisible();

  const overflow = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  expect(overflow.doc).toBeLessThanOrEqual(overflow.win + 1);

  // The dialog's own footer stays reachable: the list scrolls, the buttons do not.
  const addButton = dialog.getByRole('button', { name: /select subjects/i });
  await expect(addButton).toBeVisible();
  const box = await addButton.boundingBox();
  expect(box?.y ?? 0).toBeLessThan(844);
});
