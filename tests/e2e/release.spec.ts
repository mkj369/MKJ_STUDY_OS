import { expect, test } from '@playwright/test';
import { bootWorkspace } from './onboarding';

/**
 * Release-surface checks: the legal pages a store listing points at, the empty
 * first-run experience, and what the password-reset screen says in a build
 * without cloud accounts.
 *
 * Sample data is compiled out of a store build (see scripts/verify-release.mjs);
 * here the fixture build is used only because the rest of the suite needs data.
 */

test('privacy and terms are readable before anyone signs in', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('button', { name: /start on this device|continue on this device/i })).toBeVisible({ timeout: 20_000 });

  await page.getByRole('link', { name: 'Privacy', exact: true }).click();
  const privacy = page.getByRole('main');
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy policy' })).toBeVisible();
  await expect(privacy).toContainText(/stored in the app’s private storage on your phone/i);
  await expect(privacy).toContainText(/not collected/i);
  await expect(privacy).toContainText('minhajkhanjihan.mkj@gmail.com');

  await page.getByRole('button', { name: /^back$/i }).click();
  await expect(page.getByRole('button', { name: /start on this device|continue on this device/i })).toBeVisible();

  await page.getByRole('link', { name: 'Terms', exact: true }).click();
  await expect(page.getByRole('heading', { level: 1, name: 'Terms and about' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(/no payment account, QR code or subscription/i);
});

test('a device workspace can start with no sample data and shows honest empty states', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Class 9', exact: true }).click();
  // Class 9 may leave the group unset, so onboarding must not block on it.
  const demo = page.getByLabel(/sample data/i);
  if (await demo.count()) await demo.uncheck();
  await page.getByRole('button', { name: /start on this device|continue on this device/i }).click();

  await expect(page.getByText(/no subjects yet/i).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/^demo$/i)).toHaveCount(0);

  await page.goto('/#/sessions');
  await expect(page.getByRole('heading', { level: 1, name: 'Study Sessions' })).toBeVisible();
  const sessionsBody = await page.getByRole('main').innerText();
  expect(sessionsBody).toMatch(/no sessions|nothing recorded|log session/i);

  await page.goto('/#/tasks');
  await expect(page.getByRole('heading', { level: 1, name: /tasks/i })).toBeVisible();
  expect(await page.getByRole('main').innerText()).toMatch(/no task|empty|add task/i);
});

test('the reset screen explains that a device workspace has no password', async ({ page }) => {
  await bootWorkspace(page);
  await page.goto('/#/reset-password');
  await expect(page.getByRole('heading', { level: 1, name: 'Set a new password' })).toBeVisible();
  await expect(page.getByRole('main')).toContainText(/no password to reset/i);
  await page.getByRole('button', { name: /back to sign in/i }).click();
  await expect(page.getByText(/welcome,|good to see you/i).first()).toBeVisible({ timeout: 20_000 });
});

test('a subject created with the network switched off survives a restart', async ({ page, context }) => {
  /*
   * The device workspace must not need a server. The curriculum screen is
   * opened first so its lazy chunk is cached, exactly as it is inside the
   * Capacitor build where every asset ships in the APK; then the network is cut.
   */
  await bootWorkspace(page, { classLevel: 6 });
  await page.goto('/#/curriculum');
  await expect(page.getByRole('heading', { level: 2, name: 'Class 6' })).toBeVisible();

  await context.setOffline(true);
  await page.getByRole('button', { name: /^Add subject$/ }).first().click();
  const library = page.getByRole('dialog');
  await library.getByRole('button', { name: 'Mathematics', exact: true }).click();
  const form = page.getByRole('dialog');
  await form.getByRole('button', { name: /save subject/i }).click();
  await expect(form).toBeHidden({ timeout: 20_000 });
  await expect(page.locator('.subject-card').filter({ hasText: 'Mathematics' })).toHaveCount(1);

  await context.setOffline(false);
  await page.reload();
  await expect(page.locator('.subject-card').filter({ hasText: 'Mathematics' })).toHaveCount(1, {
    timeout: 20_000,
  });
});

test('the theme choice is stored on the device and survives a reload', async ({ page }) => {
  await bootWorkspace(page);
  await page.goto('/#/settings');
  await expect(page.getByRole('heading', { level: 2, name: 'Appearance' })).toBeVisible();

  await page.getByRole('radio', { name: 'Dark', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('radio', { name: 'Graphite', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-preset', 'graphite');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark', { timeout: 20_000 });
  await expect(page.locator('html')).toHaveAttribute('data-preset', 'graphite');
});

test('signing out and starting again reopens the same workspace, not an empty one', async ({ page }) => {
  /*
   * Regression test for the v1.0 release blocker: sign-out deliberately keeps
   * every study row (it is the student's work), but the next "Start on this
   * device" used to mint a new identity, so the old rows became unreachable and
   * the app looked freshly installed. Data was never deleted — it was orphaned.
   */
  await bootWorkspace(page, { classLevel: 11 });

  /*
   * This suite builds with VITE_DEMO_FIXTURES=true, so the workspace is not
   * empty to begin with. The test therefore measures the count before sign-out
   * and requires exactly that count afterwards, rather than assuming a number.
   */
  await page.goto('/#/curriculum');
  await page.getByRole('button', { name: /^Add subject$/ }).first().click();
  const library = page.getByRole('dialog');
  await library.getByRole('checkbox').first().check();
  await library.getByRole('button', { name: /^Add 1 subject$/ }).click();
  await expect(page.locator('.subject-card').first()).toBeVisible({ timeout: 20_000 });
  const subjectsBefore = await page.locator('.subject-card').count();
  expect(subjectsBefore).toBeGreaterThan(0);

  const owner = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('mkj.studyos.v1.db') ?? '{}');
    return (db.tables?.user_subjects ?? [])[0]?.user_id ?? null;
  });
  expect(owner).toBeTruthy();

  // Sign out — and confirm the warning explains what is kept.
  await page.getByRole('button', { name: /^Sign out$/ }).first().click();
  const confirm = page.getByRole('dialog');
  await expect(confirm).toContainText(/stay on this device/i);
  await confirm.getByRole('button', { name: /^Sign out$/ }).click();

  // The welcome screen must offer to continue, not to start over.
  const resume = page.getByRole('button', { name: /continue on this device/i });
  await expect(resume).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/existing workspace on this device will be reopened/i)).toBeVisible();

  // No class or group is asked for on resume: the stored profile already has them.
  await expect(page.getByRole('button', { name: 'Class 11', exact: true })).toHaveCount(0);
  await resume.click();

  // Same identity, same records.
  await page.goto('/#/curriculum');
  await expect(page.locator('.subject-card')).toHaveCount(subjectsBefore, { timeout: 20_000 });

  const afterRestart = await page.evaluate(() => {
    const db = JSON.parse(localStorage.getItem('mkj.studyos.v1.db') ?? '{}');
    const session = JSON.parse(localStorage.getItem('mkj.studyos.v1.session') ?? 'null');
    return {
      owner: (db.tables?.user_subjects ?? [])[0]?.user_id ?? null,
      session: session?.user?.id ?? null,
    };
  });
  expect(afterRestart.owner).toBe(owner);
  expect(afterRestart.session).toBe(owner);
});
