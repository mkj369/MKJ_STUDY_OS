import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { bootWorkspace } from './onboarding';

/**
 * The HSC Science journey, driven through the real browser UI against the local
 * demo workspace. These are the journeys the specification names (A–I); the
 * security checks that need two users live in tests/db/schema.test.ts (Postgres
 * RLS) and tests/integration (repository isolation), because the browser build
 * intentionally supports one local workspace at a time.
 */

/* Onboarding is answered by the shared helper, exactly as a student would. */
async function bootLocalWorkspace(page: Page) {
  await bootWorkspace(page);
}

test('journey A/B: open the syllabus and keep a checklist tick after a reload', async ({ page }) => {
  await bootLocalWorkspace(page);

  // A — the curriculum is reachable from the navigation and states its status.
  await page
    .getByRole('navigation', { name: /study shortcuts/i })
    .getByRole('link', { name: 'Curriculum', exact: true })
    .click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'My Curriculum' })).toBeVisible({
    timeout: 20_000,
  });
  // Demo rows are labelled as demo, never presented as official data, and they
  // arrive already in the demo class (HSC Science) rather than floating unassigned.
  await expect(page.getByText('Demo').first()).toBeVisible();
  // Demo rows live in the class they were seeded for, not in limbo.
  await expect(page.getByRole('heading', { level: 3, name: /Physics/ }).first()).toBeVisible();

  // B — open a chapter and tick a checklist item (saved, not cosmetic).
  await page.goto('/#/subjects');
  await page.getByRole('link', { name: /^Open / }).first().click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });

  const firstItem = page.locator('.checklist input[type="checkbox"]').first();
  await expect(firstItem).toBeVisible();
  await firstItem.check();
  await expect(firstItem).toBeChecked();

  // The chapter reports the same fact: checked items are a denominator, not mastery.
  await expect(page.getByText('Checklist completion').first()).toBeVisible();

  await page.reload();
  await expect(page.locator('.checklist input[type="checkbox"]').first()).toBeChecked({ timeout: 20_000 });
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

test("journey C: official templates are scoped to the student's class and group", async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/curriculum/templates');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Official templates' })).toBeVisible({
    timeout: 20_000,
  });
  const main = page.getByRole('main');

  // This student is Class 11 Science: HSC only, and only the Science stream.
  const levelOptions = await main
    .getByRole('combobox', { name: 'Level', exact: true })
    .locator('option')
    .allInnerTexts();
  expect(levelOptions).toEqual(['All levels', 'HSC']);

  const groupOptions = await main
    .getByRole('combobox', { name: 'Group / stream', exact: true })
    .locator('option')
    .allInnerTexts();
  expect(groupOptions).toEqual(['All groups', 'Science']);

  // Not one paper card belongs to another class or stream.
  const scopes = await page.locator('.paper-row__sub').allInnerTexts();
  expect(scopes.length).toBeGreaterThan(0);
  expect(scopes.every((text) => text.includes('HSC') && text.includes('Science'))).toBe(true);
  await expect(page.locator('.paper-row__sub').filter({ hasText: 'Humanities' })).toHaveCount(0);
  await expect(page.locator('.paper-row__sub').filter({ hasText: 'Business Studies' })).toHaveCount(0);

  // The coverage report is scoped the same way, so its numbers are this
  // student's numbers and not the whole reference library's.
  const coverageRow = await main.locator('table').first().locator('tbody tr').first().innerText();
  expect(coverageRow).toContain('HSC');
  expect(coverageRow).toContain('Science');
});

test('journey C2: a curriculum chapter keeps its status when the reference seed re-runs', async ({ page }) => {
  await bootLocalWorkspace(page);

  // Adopt the one HSC Science paper that carries a real chapter list.
  await page.goto('/#/curriculum/templates');
  const paper = page.locator('.paper-row').filter({ hasText: 'Show 15 chapter(s)' }).first();
  await paper.getByRole('button', { name: /Add subject \+ 15 chapter/ }).click();
  await expect(paper.getByText('All chapters added')).toBeVisible({ timeout: 20_000 });

  // Record progress against a curriculum-backed chapter.
  await page.goto('/#/syllabus');
  await page.getByRole('link', { name: /Electrostatics or Static Electricity/ }).first().click();
  await expect(page.getByRole('main').getByRole('heading', { level: 1 })).toBeVisible({ timeout: 20_000 });
  const firstItem = page.locator('.checklist input[type="checkbox"]').first();
  await firstItem.check();
  await expect(firstItem).toBeChecked();

  // A reload re-runs the curriculum seed on top of existing browser storage.
  await page.reload();
  await expect(page.locator('.checklist input[type="checkbox"]').first()).toBeChecked({ timeout: 20_000 });

  // The reference list is still described honestly: fifteen rows, none verified.
  await page.goto('/#/curriculum/templates');
  const samePaper = page.locator('.paper-row').filter({ hasText: 'Show 15 chapter(s)' }).first();
  await expect(samePaper.getByText(/15 chapter row\(s\)/)).toBeVisible();
  await expect(samePaper.getByText(/0 verified/)).toBeVisible();
});

test('journey C3: the coverage report counts HSC papers separately, 1st before 2nd', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/curriculum/templates');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Official templates' })).toBeVisible({
    timeout: 20_000,
  });
  const main = page.getByRole('main');

  // One class+group is on file: HSC Science 2026–2027, 13 subjects, 15 chapters.
  const rows = main.locator('table').first().locator('tbody tr');
  await expect(rows).toHaveCount(1);
  await expect(rows.first()).toContainText('HSC');
  await expect(rows.first()).toContainText('Science');
  await expect(rows.first()).toContainText('13');
  await expect(rows.first()).toContainText('15');
  await expect(main.getByText(/0 verified chapter\(s\)/)).toBeVisible();

  // HSC Physics is two papers, and only 2nd Paper has a chapter list.
  await main.getByRole('button', { name: /show per-subject coverage/i }).click();
  const physicsRows = main.locator('tbody tr').filter({ hasText: 'Physics' });
  await expect(physicsRows.filter({ hasText: '2nd Paper' }).first()).toContainText('15');
  await expect(physicsRows.filter({ hasText: '1st Paper' }).first()).toContainText('No chapter list yet');
});

test('journey C4: the syllabus labels a partly verified chapter list instead of hiding it', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/curriculum/templates');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Official templates' })).toBeVisible({
    timeout: 20_000,
  });

  // Adopt the one HSC paper that has a real chapter list.
  const paper = page.locator('.paper-row').filter({ hasText: 'Show 15 chapter(s)' }).first();
  await paper.getByRole('button', { name: /Add subject \+ 15 chapter/ }).click();
  await expect(paper.getByText('All chapters added')).toBeVisible({ timeout: 20_000 });

  await page.goto('/#/syllabus');
  const main = page.getByRole('main');
  await expect(main.getByText('Chapter list partly verified').first()).toBeVisible({ timeout: 20_000 });
  // The English-only caveat is the whole point of the 0011 import.
  await expect(main.getByText(/printed English title/i).first()).toBeVisible();
  await expect(main.getByRole('link', { name: /Electrostatics or Static Electricity/ }).first()).toBeVisible();
});

test('journey C5: one click on a paper leaves a subject with its real chapters', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/curriculum/templates');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Official templates' })).toBeVisible({
    timeout: 20_000,
  });

  // The button names the chapter count it will attach, and one click must not
  // leave a subject that only looks empty.
  const paper = page.locator('.paper-row').filter({ hasText: 'Show 15 chapter(s)' }).first();
  await paper.getByRole('button', { name: /Add subject \+ 15 chapter\(s\)/ }).click();
  await expect(paper.getByText('All chapters added')).toBeVisible({ timeout: 20_000 });

  // And the syllabus shows the chapters without a second visit to this page.
  await page.goto('/#/syllabus');
  const main = page.getByRole('main');
  await expect(main.getByText('0/15 chapters complete').first()).toBeVisible({ timeout: 20_000 });
  await expect(main.getByRole('link', { name: /Electrostatics or Static Electricity/ }).first()).toBeVisible();
});

test('journey C6: a paper with no recovered chapter list says so instead of looking empty', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/curriculum/templates');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Official templates' })).toBeVisible({
    timeout: 20_000,
  });

  const card = page.locator('.paper-row').filter({ hasText: 'No chapter list yet' }).first();
  await card.getByRole('button', { name: /^Add subject$/ }).click();

  // Adopted, but honest about why nothing came with it.
  await expect(card.getByText('Track chapters you add yourself')).toBeVisible({ timeout: 20_000 });
  // The paper card states it in the body as well as the actions, so the empty
  // paper never looks like a complete one with nothing in it yet.
  await expect(card.getByText(/NCTB has not published a contents page/i)).toBeVisible();
});

test('journey C7: a paper card states its verification and expands to its chapters', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/curriculum/templates');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Official templates' })).toBeVisible({
    timeout: 20_000,
  });

  // The one recovered paper, addressed as a paper rather than as a subject.
  const card = page.locator('.paper-row').filter({ hasText: 'Show 15 chapter(s)' }).first();
  await expect(card).toBeVisible();

  // It says how many rows it has and that none of them is verified — the card is
  // not allowed to look complete because it has fifteen rows.
  await expect(card.getByText(/15 chapter row\(s\)/)).toBeVisible();
  await expect(card.getByText(/0 verified/)).toBeVisible();
  await expect(card.getByText(/15 partial/)).toBeVisible();
  await expect(card.getByText('Partly verified')).toBeVisible();

  // Expanding shows the printed titles, in order, each with its source.
  await card.locator('summary').click();
  const rows = card.locator('.chapter-list__row');
  await expect(rows).toHaveCount(15);
  await expect(rows.first()).toContainText('Electrostatics or Static Electricity');
  await expect(rows.first().locator('.chapter-list__num')).toHaveText('1');
  await expect(rows.last()).toContainText('Theory Of Relativity And Astro Physics');
});

test('journey C8: a paper with no official list says so and never looks empty-but-fine', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/curriculum/templates');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Official templates' })).toBeVisible({
    timeout: 20_000,
  });

  const card = page.locator('.paper-row').filter({ hasText: 'No chapter list yet' }).first();
  await expect(card).toBeVisible();
  // The reason is on the card itself, in words a student can act on.
  await expect(card.getByText(/NCTB has not published a contents page/i)).toBeVisible();
  // And no chapter disclosure is offered, because there is nothing to disclose.
  await expect(card.locator('summary')).toHaveCount(0);
});

test('journey C9: searching by Bengali paper name finds the same paper as the English one', async ({ page }) => {
  await bootLocalWorkspace(page);
  await page.goto('/#/curriculum/templates');
  await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Official templates' })).toBeVisible({
    timeout: 20_000,
  });

  const search = page.getByPlaceholder(/Physics 2nd Paper/);

  await search.fill('Physics 2nd Paper');
  await expect(page.locator('.paper-row').first()).toBeVisible();
  const englishCount = await page.locator('.paper-row').count();
  const englishTitles = await page.locator('.paper-row__title').allInnerTexts();
  expect(englishTitles.every((title) => title.includes('2nd Paper'))).toBe(true);

  await search.fill('পদার্থবিজ্ঞান ২য়');
  await expect(page.locator('.paper-row').first()).toBeVisible();
  const bengaliTitles = await page.locator('.paper-row__title').allInnerTexts();

  // The same official paper is found by its Bengali name.
  expect(bengaliTitles.some((title) => title.includes('পদার্থবিজ্ঞান') && title.includes('2nd Paper'))).toBe(true);
  expect(bengaliTitles.every((title) => title.includes('2nd Paper'))).toBe(true);

  // It can legitimately return fewer cards: a version row has no Bengali name to
  // match, and inventing one to make the counts agree would be worse than the
  // smaller list.
  expect(bengaliTitles.length).toBeLessThanOrEqual(englishCount);
  expect(englishTitles.length).toBeGreaterThan(0);
});
