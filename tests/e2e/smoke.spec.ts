import { expect, test } from '@playwright/test';

test('boots in local demo mode with a real browser', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText(/Local demo mode/i).first()).toBeVisible();
  await page.getByRole('button', { name: /start local workspace/i }).click();
  await expect(page.getByText(/welcome,|good to see you/i)).toBeVisible({ timeout: 20_000 });
});
