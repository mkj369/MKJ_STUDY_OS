import { expect, test } from '@playwright/test';
import { bootWorkspace } from './onboarding';

test('boots in local demo mode with a real browser', async ({ page }) => {
  await bootWorkspace(page);

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
    await bootWorkspace(page);

    /*
     * Five destinations in the bottom bar; More is a real route, not a drawer
     * toggle, and it is the map to every secondary screen.
     */
    const bottom = page.getByRole('navigation', { name: /quick navigation/i });
    await expect(bottom).toBeVisible();
    await expect(bottom.getByRole('link')).toHaveCount(5);
    await bottom.getByRole('link', { name: /^more$/i }).click();
    await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'More' })).toBeVisible({
      timeout: 20_000,
    });
    await page.getByRole('link', { name: /formula vault/i }).first().click();
    await expect(page.getByRole('main').getByRole('heading', { level: 1, name: 'Formula vault' })).toBeVisible({
      timeout: 20_000,
    });

    // The hamburger opens the full navigation drawer at 390px.
    await page.getByRole('button', { name: /open navigation menu/i }).click();
    const drawer = page.getByRole('dialog', { name: /navigation menu/i });
    await expect(drawer).toBeVisible();
    await drawer.getByRole('button', { name: /close menu/i }).click();
    await expect(drawer).toBeHidden();

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
