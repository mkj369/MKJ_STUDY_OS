import { expect, type Page } from '@playwright/test';

/**
 * Shared first-run path for the browser suites.
 *
 * A fresh workspace now opens onboarding before any curriculum appears, so every
 * test that wants the dashboard has to answer it. Keeping this in one helper
 * means the suites exercise the same path a student actually takes, and a change
 * to onboarding only needs one update.
 */
export async function completeOnboarding(page: Page, options: { classLevel?: number; group?: string } = {}) {
  const classLevel = options.classLevel ?? 11;
  const group = options.group ?? 'Science';

  await expect(page.getByRole('heading', { name: /which class do you study in/i })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByRole('button', { name: String(classLevel), exact: true }).click();
  await page.getByRole('button', { name: /^continue/i }).click();

  const groupStep = page.getByRole('heading', { name: /which group are you in/i });
  if (await groupStep.count()) {
    await page.getByRole('radio', { name: new RegExp(group, 'i') }).click();
    await page.getByRole('button', { name: /start studying/i }).click();
  }
}

/** Start the device-local workspace and get past onboarding. */
export async function bootWorkspace(page: Page, options: { classLevel?: number; group?: string } = {}) {
  await page.goto('/');
  const start = page.getByRole('button', { name: /start local workspace/i });
  await expect(start).toBeVisible({ timeout: 20_000 });
  await start.click();

  const onboarding = page.getByRole('heading', { name: /which class do you study in/i });
  const dashboard = page.getByText(/good to see you|welcome,/i).first();
  await Promise.race([
    onboarding.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined),
    dashboard.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined),
  ]);
  if (await onboarding.count()) {
    await completeOnboarding(page, options);
  }
  await expect(dashboard).toBeVisible({ timeout: 20_000 });
}
