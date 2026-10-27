import { expect, test } from '@playwright/test';

test('boots in local demo mode with a real browser', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/Local demo mode/i).first()).toBeVisible();
  await page.getByRole('button', { name: /start local workspace/i }).click();
  await expect(page.getByText(/welcome,|good to see you/i)).toBeVisible({ timeout: 20_000 });

  // Regression: the stored session must survive a reload. Earlier builds wrote
  // `{ user, createdAt }` and read it as a bare user, so a refresh signed the
  // student out silently.
  await page.reload();
  await expect(page.getByText(/welcome,|good to see you/i)).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/local demo/i).first()).toBeVisible();
});

test.describe('small screen', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the mobile shell scrolls, opens the drawer and has no sideways overflow', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /start local workspace/i }).click();
    await expect(page.getByText(/welcome,|good to see you/i).first()).toBeVisible({ timeout: 20_000 });

    // Bottom navigation is the mobile shell, and it reaches every secondary screen.
    await expect(page.getByRole('navigation', { name: /quick navigation/i })).toBeVisible();
    await page.getByRole('button', { name: /more/i }).click();
    const drawer = page.getByRole('dialog', { name: /navigation menu/i });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('link', { name: /formula vault/i })).toBeVisible();
    await drawer.getByRole('link', { name: /formula vault/i }).click();
    await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Formula vault' })).toBeVisible({
      timeout: 20_000,
    });

    const overflow = await page.evaluate(() => ({
      doc: document.documentElement.scrollWidth,
      win: window.innerWidth,
    }));
    expect(overflow.doc).toBeLessThanOrEqual(overflow.win + 1);

    // The main column must be scrollable on a short screen (Ionic fixes the app box).
    const scrollable = await page.evaluate(() => {
      const main = document.querySelector('.app-main') as HTMLElement | null;
      return main ? getComputedStyle(main).overflowY : 'missing';
    });
    expect(scrollable).toBe('auto');
  });
});
