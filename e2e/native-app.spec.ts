// The app is a native shell that adds "PsalmsPlayerApp" to the browser's user agent. Inside it the admin site does not exist.
import { expect, test } from '@playwright/test';
import { signInAsAdmin } from './helpers';

test.describe('inside the app', () => {
  test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel) AppleWebKit/537.36 Chrome/150.0 Mobile Safari/537.36 PsalmsPlayerApp/1' });

  test('an admin sees no Admin site row, and /admin sends the app back to Home', async ({ page }) => {
    await signInAsAdmin(page);
    await page.goto('/settings');
    await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
    await expect(page.getByRole('link', { name: /Admin site/ })).toHaveCount(0);
    await page.goto('/admin');
    await expect(page).toHaveURL(/localhost:3000\/$/);
    await page.goto('/admin/songs');
    await expect(page).toHaveURL(/localhost:3000\/$/);
  });
});

test('in a normal browser the same admin sees the Admin site row and can open it', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/settings');
  await expect(page.getByRole('link', { name: /Admin site/ })).toBeVisible();
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin$/);
});
