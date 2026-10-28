import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

/**
 * The HSC Science journey, driven through the real browser UI against the local
 * demo workspace. These are the journeys the specification names (A–I); the
 * security checks that need two users live in tests/db/schema.test.ts (Postgres
 * RLS) and tests/integration (repository isolation), because the browser build
 * intentionally supports one local workspace at a time.
 */

async function bootLocalWorkspace(page: Page) {
  await page.goto('/');
  await expect(page.getByText(/Local demo mode/i).first()).toBeVisible();
  await page.getByRole('button', { name: /start local workspace/i }).click();
  await expect(page.getByText(/good to see you|welcome,/i).first()).toBeVisible({ timeout: 20_000 });
}

test('journey A/B: open the syllabus and keep a checklist tick after a reload', async ({ page }) => {
  await bootLocalWorkspace(page);

  // A — the curriculum is reachable from the navigation and states its status.
  await page.getByRole('navigation').getByRole('link', { name: /my curriculum/i }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'My Curriculum' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText(/needs verification|demo/i).first()).toBeVisible();

  // B — open a chapter and tick a checklist item (saved, not cosmetic).
  await page.goto('/#/subjects');
  await page.getByRole('link', { name: /^Open / }).first().click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });

  const firstItem = page.locator('.checklist input[type="checkbox"]').first();
  await expect(firstItem).toBeVisible();
  await firstItem.check();
  await expect(firstItem).toBeChecked();

  await page.reload();
  await expect(page.locator('.checklist input[type="checkbox"]').first()).toBeChecked({ timeout: 20_000 });

  // The dashboard reports the same fact (checked items are a denominator, not mastery).
  await page.goto('/#/');
  await expect(page.getByText('Checklist completion').first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/\d+ of \d+ items · separate from mastery/)).toBeVisible();
});

test('journey D: create a task, complete it, then reschedule another', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/tasks');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Tasks & Weekly Plan' })).toBeVisible();

  await page.getByRole('button', { name: /new task/i }).click();
  await page.getByLabel('Task', { exact: true }).fill('E2E — solve 10 projectile numericals');
  await page.getByLabel('Estimated minutes', { exact: true }).fill('40');
  await page.getByRole('button', { name: 'Create task', exact: true }).last().click();

  const row = page.locator('.list-row', { hasText: 'E2E — solve 10 projectile numericals' });
  await expect(row).toBeVisible({ timeout: 20_000 });

  // Ticking it moves the task out of the "Open" filter, so assert on the Done tab
  // instead of on a checkbox that is no longer on screen.
  await row.getByRole('checkbox').first().click();
  await page.getByRole('button', { name: /^Done \(/ }).click();
  await expect(page.locator('.list-row', { hasText: 'E2E — solve 10 projectile numericals' })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: /^Open \(/ }).click();

  // A second task gets rescheduled — missing a plan never deletes work.
  await page.getByRole('button', { name: /new task/i }).click();
  await page.getByLabel('Task', { exact: true }).fill('E2E — revise capacitors');
  await page.getByLabel('Estimated minutes', { exact: true }).fill('25');
  await page.getByRole('button', { name: 'Create task', exact: true }).last().click();

  const second = page.locator('.list-row', { hasText: 'E2E — revise capacitors' });
  await expect(second).toBeVisible({ timeout: 20_000 });
  await second.getByRole('button', { name: 'Reschedule', exact: true }).click();
  await page.getByLabel(/Planned day/).fill('2026-11-02');
  await page.getByRole('button', { name: 'Reschedule', exact: true }).last().click();
  await expect(page.getByText('planned 2026-11-02').first()).toBeVisible({ timeout: 20_000 });

  await page.reload();
  await expect(page.locator('.list-row', { hasText: 'E2E — revise capacitors' })).toContainText('planned 2026-11-02', {
    timeout: 20_000,
  });
});

test('journey E: a mistake links to a practice question and survives a reload', async ({ page }) => {
  await bootLocalWorkspace(page);

  // F — create the question first.
  await page.goto('/#/practice');
  await page.getByRole('button', { name: /add question/i }).click();
  await page.getByLabel('Question', { exact: true }).fill('E2E — state Newton’s second law');
  await page.getByRole('button', { name: 'Add question', exact: true }).last().click();
  await expect(page.getByText('E2E — state Newton’s second law').first()).toBeVisible({ timeout: 20_000 });

  // E — log the mistake against that question.
  await page.goto('/#/mistakes');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Mistake Log' })).toBeVisible();
  await page.getByRole('button', { name: /log mistake/i }).first().click();
  await page.getByLabel(/What went wrong/).fill('E2E — wrote F = ma but forgot it is a vector equation');
  const questionSelect = page.getByLabel(/Practice question/);
  const questionValue = await questionSelect.locator('option', { hasText: 'E2E — state Newton' }).getAttribute('value');
  expect(questionValue).toBeTruthy();
  await questionSelect.selectOption(questionValue as string);
  await page.getByRole('button', { name: 'Log mistake', exact: true }).last().click();

  const mistakeRow = page.locator('.list-row', { hasText: 'E2E — wrote F = ma' });
  await expect(mistakeRow).toBeVisible({ timeout: 20_000 });
  await expect(mistakeRow).toContainText('Practice question: E2E — state Newton’s second law');

  // The relationship is stored, not just on screen.
  await page.reload();
  await expect(page.locator('.list-row', { hasText: 'E2E — wrote F = ma' })).toContainText('Practice question', {
    timeout: 20_000,
  });

  // The link is a working action, not decoration: it opens that exact question's
  // attempt form, and it can be submitted.
  await page.locator('.list-row', { hasText: 'E2E — wrote F = ma' }).getByRole('link', { name: /Practice question/ }).click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Question practice' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.getByText('E2E — state Newton’s second law').first()).toBeVisible();
  // Ionic renders the form modal in a portal; scope by its accessible label.
  const attemptDialog = page.locator('ion-modal').filter({ hasText: 'Record an attempt' });
  await expect(attemptDialog).toBeVisible({ timeout: 20_000 });
  await expect(attemptDialog).toContainText('E2E — state Newton’s second law');
  await page.getByLabel('Your answer').fill('F = ma, direction follows the net force');
  await page.getByLabel('Was it correct?').click();
  await page.getByRole('button', { name: 'Save attempt', exact: true }).last().click();
  await expect(page.getByText(/Attempt saved: correct/i).first()).toBeVisible({ timeout: 20_000 });

  // The parameter is consumed: a reload does not re-open the dialog.
  await page.reload();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Question practice' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(page.locator('ion-modal')).toHaveCount(0);

  // Unlinking is allowed too: the mistake stays, the link is cleared.
  await page.goto('/#/mistakes');
  await page.locator('.list-row', { hasText: 'E2E — wrote F = ma' }).getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel(/Practice question/).selectOption('');
  await page.getByRole('button', { name: 'Save changes', exact: true }).last().click();
  await expect(page.locator('.list-row', { hasText: 'E2E — wrote F = ma' })).not.toContainText('Practice question', {
    timeout: 20_000,
  });
});

test('journey G/I: insights separate facts from guesses, and export downloads real data', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/insights');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Progress insights' })).toBeVisible();
  for (const band of ['1 · Observed', '2 · Calculated', '3 · Interpretation', '4 · Missing']) {
    await expect(page.getByText(band, { exact: false }).first()).toBeVisible();
  }
  // With no AI provider configured the page still works and says so.
  await expect(page.getByText(/works fully without the AI provider|AI recommendations are separate/i).first()).toBeVisible();

  // I — the JSON backup contains the tables, labelled demo rows included.
  await page.goto('/#/export');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Export & academic history' })).toBeVisible();
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: /download full json backup/i }).click(),
  ]);
  expect(download.suggestedFilename()).toMatch(/^mkj-studyos-backup-\d{4}-\d{2}-\d{2}\.json$/);
  const path = await download.path();
  expect(path).toBeTruthy();
  const payload = JSON.parse(readFileSync(path as string, 'utf8')) as {
    mode: string;
    tables: Record<string, unknown[]>;
  };
  expect(payload.mode).toBe('local');
  expect(Array.isArray(payload.tables['user_subjects'])).toBe(true);
  expect((payload.tables['user_subjects'] ?? []).length).toBeGreaterThan(0);
  // Every exported row carries its owner and the demo flag, so an export can be audited.
  const firstSubject = (payload.tables['user_subjects'] as { user_id?: string; is_demo?: boolean }[])[0];
  expect(firstSubject?.user_id).toBeTruthy();
  expect(typeof firstSubject?.is_demo).toBe('boolean');
});

test('quick capture saves a note that the vault can find', async ({ page }) => {
  await bootLocalWorkspace(page);

  await page.getByRole('button', { name: /quick capture a note/i }).click();
  await page.getByLabel('Title', { exact: true }).fill('E2E — escape velocity');
  await page.getByLabel('Note', { exact: true }).fill('v = sqrt(2GM/r) — check the derivation before the test.');
  const kind = page.getByLabel('Kind', { exact: true });
  const formulaValue = await kind.locator('option', { hasText: 'Formula' }).getAttribute('value');
  await kind.selectOption(formulaValue as string);
  await page.getByRole('button', { name: 'Save note', exact: true }).click();
  await expect(page.getByText(/captured/i).first()).toBeVisible({ timeout: 20_000 });

  // Same row, seen from the formula vault — one source of truth.
  await page.goto('/#/vault');
  await page.getByPlaceholder(/projectile, Newton, pH/i).fill('escape velocity');
  await expect(page.getByText('E2E — escape velocity').first()).toBeVisible({ timeout: 20_000 });
});

test('journey C: curriculum filters narrow by SSC/HSC, group and Bangla subject name', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/curriculum');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'My Curriculum' })).toBeVisible({
    timeout: 20_000,
  });

  const main = page.getByRole('main');

  // Both levels ship, and the page says what it really contains.
  await expect(main.getByLabel('Level').locator('option', { hasText: 'SSC' })).toHaveCount(1);
  await expect(main.getByLabel('Level').locator('option', { hasText: 'HSC' })).toHaveCount(1);
  await expect(main.getByText(/curriculum version\(s\)/)).toBeVisible();

  await main.getByLabel('Level').selectOption('SSC');
  await main.getByLabel('Group / stream').selectOption('Science');
  await expect(main.getByRole('heading', { name: /SSC Science — official subject structure/ })).toBeVisible();
  await expect(main.getByRole('heading', { name: /HSC/ })).toHaveCount(0);

  // Physics carries a Bangla name and — since migration 0010 — a real chapter
  // list read from the printed contents page. It is partly recorded, never
  // verified: the scan is a 2022 reprint and the 2025 edition is unopened.
  await main.getByPlaceholder(/Physics, পদার্থবিজ্ঞান/).fill('পদার্থ');
  await expect(main.getByText('Physics · পদার্থবিজ্ঞান').first()).toBeVisible();
  await expect(main.getByText('Chapter list partly recorded').first()).toBeVisible();
  await expect(main.getByText('14 chapter row(s)').first()).toBeVisible();
  // The page reports the whole truth, not just the good half: 41 chapter rows
  // exist across the whole curriculum, and not one of them is verified.
  await expect(main.getByText('41 chapter(s)', { exact: true }).first()).toBeVisible();
  await expect(main.getByText('0 verified chapter(s)', { exact: true }).first()).toBeVisible();

  // Filtering never deletes or hides the user's own records.
  await main.getByRole('button', { name: /clear filters/i }).first().click();
  await expect(main.getByRole('heading', { name: 'Your subjects' })).toBeVisible();
  await expect(main.getByText('Physics — 1st Paper').first()).toBeVisible();
});

test('journey C2: a modelled chapter keeps its status when the curriculum seed re-runs', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/syllabus');
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });

  // Record progress against a curriculum-backed chapter.
  await page.getByRole('link', { name: /Demo chapter 1 — mechanics/ }).first().click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
  const firstItem = page.locator('.checklist input[type="checkbox"]').first();
  await firstItem.check();
  await expect(firstItem).toBeChecked();

  // A reload re-runs the curriculum seed on top of existing browser storage.
  await page.reload();
  await expect(page.locator('.checklist input[type="checkbox"]').first()).toBeChecked({ timeout: 20_000 });

  // The official subject structure is still present and still unverified.
  await page.goto('/#/curriculum');
  await expect(page.getByRole('main').getByText(/Chapter list not yet verified/).first()).toBeVisible({
    timeout: 20_000,
  });
});

test('journey C3: HSC leads, and the coverage report counts papers separately', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/curriculum');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'My Curriculum' })).toBeVisible({
    timeout: 20_000,
  });
  const main = page.getByRole('main');

  // The notice is computed from the data, not typed into the sentence: it must
  // agree with the badges next to it.
  await expect(main.getByText(/3 of 86 subjects have a chapter list/)).toBeVisible();
  await expect(main.getByText('41 chapter(s)', { exact: true }).first()).toBeVisible();
  await expect(main.getByText('0 verified chapter(s)', { exact: true }).first()).toBeVisible();

  // HSC comes first in the level filter and in the group table — but SSC is
  // still present, not hidden behind it.
  //
  // Address the control by role, not getByLabel: the wrapping <label> also
  // contains the <option> texts, so its label string is "Level All levels HSC
  // SSC" and getByLabel('Level', { exact: true }) matches nothing.
  const levelSelect = main.getByRole('combobox', { name: 'Level', exact: true });
  await expect(levelSelect).toBeVisible({ timeout: 15_000 });
  const levelOptions = await levelSelect
    .locator('option')
    .evaluateAll((options) => options.map((option) => option.textContent ?? ''));
  expect(levelOptions.findIndex((text) => text.includes('HSC'))).toBeLessThan(
    levelOptions.findIndex((text) => text.includes('SSC')),
  );

  const groupTable = main.locator('table').first();
  const firstGroupRow = await groupTable.locator('tbody tr').first().innerText();
  expect(firstGroupRow).toContain('HSC');
  // toContainText is case-sensitive on textContent; the CSS uppercases it.
  await expect(groupTable.locator('thead')).toContainText(/no chapters/i);

  // HSC Physics is two subjects, and only 2nd Paper has a chapter list.
  await page.getByRole('button', { name: /show per-subject coverage/i }).click();
  const physicsRows = main.locator('tbody tr').filter({ hasText: 'Physics' });
  await expect(physicsRows.filter({ hasText: '2nd Paper' }).first()).toContainText('15');
  await expect(physicsRows.filter({ hasText: '1st Paper' }).first()).toContainText('No chapter list yet');
});

test('journey C4: the syllabus labels a partly verified chapter list instead of hiding it', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/curriculum');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'My Curriculum' })).toBeVisible({
    timeout: 20_000,
  });

  // Adopt the one HSC subject-paper that has a real chapter list.
  await page.getByRole('button', { name: /show per-subject coverage/i }).click();
  const secondPaper = page
    .getByRole('main')
    .locator('tbody tr')
    .filter({ hasText: 'Physics' })
    .filter({ hasText: '2nd Paper' })
    .first();
  await secondPaper.getByRole('button', { name: /add to my subjects/i }).click();

  await page.goto('/#/syllabus');
  const main = page.getByRole('main');
  await expect(main.getByText('Chapter list partly verified').first()).toBeVisible({ timeout: 20_000 });
  // The English-only caveat is the whole point of the 0011 import.
  await expect(main.getByText(/printed English title/i).first()).toBeVisible();
  await expect(main.getByRole('link', { name: /Electrostatics or Static Electricity/ }).first()).toBeVisible();
});

test('journey C5: one click on a version row leaves a subject with its real chapters', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/curriculum');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'My Curriculum' })).toBeVisible({
    timeout: 20_000,
  });

  // The version list is the other way in, and it must not leave a subject that
  // looks empty. The button names the chapter count it will attach.
  const row = page.getByRole('main').locator('.list-row').filter({ hasText: '15 chapter row(s)' }).first();
  const addButton = row.getByRole('button', { name: /Add subject \+ 15 chapter\(s\)/ });
  await expect(addButton).toBeVisible();
  await addButton.click();

  await expect(row.getByText('All chapters added')).toBeVisible({ timeout: 20_000 });

  // And the syllabus shows the chapters without a second visit to this page.
  await page.goto('/#/syllabus');
  const main = page.getByRole('main');
  await expect(main.getByText('0/15 chapters complete').first()).toBeVisible({ timeout: 20_000 });
  await expect(main.getByRole('link', { name: /Electrostatics or Static Electricity/ }).first()).toBeVisible();
});

test('journey C6: a subject with no recovered chapter list says so instead of looking empty', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/curriculum');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'My Curriculum' })).toBeVisible({
    timeout: 20_000,
  });

  const row = page.getByRole('main').locator('.list-row').filter({ hasText: 'no chapter list yet' }).first();
  await expect(row.getByRole('button', { name: /^Add subject$/ })).toBeVisible();
  await row.getByRole('button', { name: /^Add subject$/ }).click();

  // Adopted, but honest about why nothing came with it.
  await expect(row.getByText('Track chapters you add yourself')).toBeVisible({ timeout: 20_000 });
  await expect(row.getByText(/no chapter list yet/)).toBeVisible();
});
