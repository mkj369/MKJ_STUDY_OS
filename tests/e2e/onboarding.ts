import { expect, type Page } from '@playwright/test';

/**
 * Shared first-run path for the browser suites.
 *
 * The release build asks for class and group on the welcome screen and writes
 * them straight to the profile, so onboarding does not ask a second time. The
 * helper below drives that path exactly as a student would. Older builds asked
 * after sign-in; the fallback keeps the helper correct either way.
 */
export async function bootWorkspace(page: Page, options: { classLevel?: number; group?: string } = {}) {
  const classLevel = options.classLevel ?? 11;
  const group = options.group ?? 'Science';

  await page.goto('/');
  const start = page.getByRole('button', { name: /start on this device|continue on this device|start local workspace/i });
  await expect(start).toBeVisible({ timeout: 20_000 });

  await page.getByRole('button', { name: `Class ${classLevel}`, exact: true }).click();

  // The group is only offered for Classes 9-12.
  if (classLevel >= 9) {
    const groupChip = page.getByRole('radio', { name: group, exact: true });
    if (await groupChip.count()) await groupChip.click();
  }

  await start.click();

  // A build without this change still sends the student through onboarding.
  const onboarding = page.getByRole('heading', { name: /which class do you study in/i });
  const dashboard = page.getByText(/good to see you|welcome,/i).first();
  await Promise.race([
    onboarding.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined),
    dashboard.waitFor({ state: 'visible', timeout: 20_000 }).catch(() => undefined),
  ]);
  if (await onboarding.count()) {
    await page.getByRole('button', { name: String(classLevel), exact: true }).click();
    await page.getByRole('button', { name: /^continue/i }).click();
    const groupStep = page.getByRole('heading', { name: /which group are you in/i });
    if (await groupStep.count()) {
      await page.getByRole('radio', { name: new RegExp(group, 'i') }).click();
      await page.getByRole('button', { name: /start studying/i }).click();
    }
  }
  await expect(dashboard).toBeVisible({ timeout: 20_000 });
}

export async function completeOnboarding(page: Page, options: { classLevel?: number; group?: string } = {}) {
  const classLevel = options.classLevel ?? 11;
  const group = options.group ?? 'Science';
  await expect(page.getByRole('heading', { name: /which class do you study in/i })).toBeVisible({ timeout: 20_000 });
  await page.getByRole('button', { name: String(classLevel), exact: true }).click();
  await page.getByRole('button', { name: /^continue/i }).click();
  const groupStep = page.getByRole('heading', { name: /which group are you in/i });
  if (await groupStep.count()) {
    await page.getByRole('radio', { name: new RegExp(group, 'i') }).click();
    await page.getByRole('button', { name: /start studying/i }).click();
  }
}
