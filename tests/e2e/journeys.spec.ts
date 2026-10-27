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
