// The app is a native shell that adds "PsalmsPlayerApp" to the browser's user agent. Inside it the admin site does not exist.
import { expect, test } from '@playwright/test';
import { signInAsAdmin } from './helpers';

test.describe('inside the app', () => {
  test.use({ userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel) AppleWebKit/537.36 Chrome/150.0 Mobile Safari/537.36 PsalmsPlayerApp/1' });

  // The first open: the welcome slides come before the sign-in page.
  test.describe('first open', () => {
    test('the first open shows four welcome slides, then the sign-in page, and never again', async ({ page }) => {
      await page.goto('/login');
      const slides = page.getByRole('dialog', { name: 'Welcome to PsalmsPlayer' });
      await expect(slides).toBeVisible();
      await expect(slides).toContainText('Slide 1 of 4');
      await expect(slides.getByRole('button', { name: 'Skip' })).toBeVisible();
      for (const n of [2, 3, 4]) {
        await slides.getByRole('button', { name: 'Next' }).click();
        await expect(slides).toContainText(`Slide ${n} of 4`);
      }
      await expect(slides.getByRole('button', { name: 'Skip' })).toHaveCount(0); // nothing left to skip
      await slides.getByRole('button', { name: 'Get started' }).click();
      await expect(slides).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
      await page.reload();
      await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
      await expect(page.getByRole('dialog')).toHaveCount(0);
    });

    test('Skip also ends the welcome for good', async ({ page }) => {
      await page.goto('/login');
      await page.getByRole('dialog', { name: 'Welcome to PsalmsPlayer' }).getByRole('button', { name: 'Skip' }).click();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await page.goto('/login?next=%2Fsearch');
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
    });
  });

  // Everything else in the app: the welcome has been seen already (the app remembers it with a cookie), so the sign-in page is not covered.
  test.describe('after the welcome', () => {
    test.beforeEach(async ({ context }) => {
      await context.addCookies([{ name: 'pp_welcome', value: '1', url: 'http://localhost:3000' }]);
    });

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
});

test('in a normal browser the same admin sees the Admin site row and can open it', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/settings');
  await expect(page.getByRole('link', { name: /Admin site/ })).toBeVisible();
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/admin$/);
});
