// The app frame and the small screens around it: tabs, Home header, song rows (heart and ⋮ menu), the Settings menu.
// Nothing here plays audio (the monthly-listener check in catalogue.spec.ts needs a database nobody has listened in).
import { expect, test } from '@playwright/test';
import { signInAsAdmin, signUpAndIn, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial' });

test('the frame offers Home, Search and Library; Settings sits behind the avatar; Browse links still work', async ({ page }) => {
  await signUpAndIn(page, uniqueEmail('frame'));
  await expect(page.getByRole('navigation', { name: 'Main' }).getByRole('link')).toHaveText(['Home', 'Search', 'Library']);
  await expect(page.getByRole('link', { name: 'Browse' })).toHaveCount(0);
  // Signing out is under Settings, not in the frame.
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);

  // The Home header: a greeting, the Liked shortcut and the avatar.
  await expect(page.getByRole('heading', { name: 'Welcome', level: 1 })).toBeVisible();
  await page.getByRole('link', { name: 'Liked songs' }).click();
  await expect(page).toHaveURL(/\/library\/liked$/);
  await expect(page.getByRole('heading', { name: 'Liked songs', level: 1 })).toBeVisible();
  await expect(page.getByText('Songs you like appear here.')).toBeVisible();

  await page.goto('/');
  await page.getByRole('link', { name: 'Profile' }).click();
  await expect(page).toHaveURL(/\/settings$/);

  // The old address keeps working and carries the search text along.
  await page.goto('/browse?q=single');
  await expect(page).toHaveURL(/\/search\?q=single$/);
  await expect(page.getByText('Placeholder Single', { exact: true })).toBeVisible();
});

test('a heart on a row likes the song everywhere, and the ⋮ menu offers share, add to list, Stage mode and YouTube', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  // Headless Chromium on Linux has no share sheet, but make sure of it: the link must be copied.
  await context.addInitScript(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
  });
  await signUpAndIn(page, uniqueEmail('rows'));
  await page.goto('/search?q=placeholder');

  const one = page.locator('.song-row').filter({ hasText: 'Placeholder Song One' });
  const single = page.locator('.song-row').filter({ hasText: 'Placeholder Single' });
  await expect(one).toHaveCount(1);

  // Like from the row: the heart changes at once and the like is saved.
  const saved = page.waitForResponse((r) => r.url().includes('/rest/v1/song_likes') && r.request().method() === 'POST');
  await one.getByRole('button', { name: 'Like Placeholder Song One', exact: true }).click();
  expect((await saved).ok(), 'the like is saved').toBeTruthy();
  await expect(one.getByRole('button', { name: 'Unlike Placeholder Song One', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // It shows on the Liked page (a full page load: the hearts come from the database), and can be taken back there.
  await page.goto('/library/liked');
  const likedRow = page.locator('.song-row').filter({ hasText: 'Placeholder Song One' });
  await expect(likedRow).toHaveCount(1);
  await expect(page.locator('.song-row')).toHaveCount(1);
  const removed = page.waitForResponse((r) => r.url().includes('/rest/v1/song_likes') && r.request().method() === 'DELETE');
  await likedRow.getByRole('button', { name: 'Unlike Placeholder Song One', exact: true }).click();
  expect((await removed).ok(), 'the like is removed').toBeTruthy();
  await expect(likedRow.getByRole('button', { name: 'Like Placeholder Song One', exact: true })).toHaveAttribute('aria-pressed', 'false');

  // The ⋮ menu of a song with a working YouTube link.
  await page.goto('/search?q=placeholder');
  await one.getByRole('button', { name: 'More options for Placeholder Song One' }).click();
  const dialog = page.getByRole('dialog', { name: 'Options for Placeholder Song One' });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole('link', { name: 'Stage mode' })).toHaveAttribute('href', '/stage/song/placeholder-song-one');
  const youtube = dialog.getByRole('link', { name: 'Watch on YouTube' });
  await expect(youtube).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await expect(youtube).toHaveAttribute('target', '_blank');

  // Share link copies the web link, which goes through login and returns to the song.
  await dialog.getByRole('button', { name: 'Share link' }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole('status').filter({ hasText: 'Link copied.' })).toBeVisible();
  const copied = await page.evaluate(() => navigator.clipboard.readText());
  expect(copied).toMatch(/\/login\?next=%2Fsong%2Fplaceholder-song-one$/);

  // Add to list: start a playlist from the menu.
  await one.getByRole('button', { name: 'More options for Placeholder Song One' }).click();
  await dialog.getByRole('button', { name: 'Add to list' }).click();
  await dialog.getByLabel('New playlist').fill('From the menu');
  await dialog.getByRole('button', { name: 'Create and add' }).click();
  await expect(dialog.getByRole('status').filter({ hasText: 'Added to From the menu.' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(dialog).toHaveCount(0);

  // A song with no YouTube link has no such item.
  await single.getByRole('button', { name: 'More options for Placeholder Single' }).click();
  const dialog2 = page.getByRole('dialog', { name: 'Options for Placeholder Single' });
  await expect(dialog2.getByRole('link', { name: 'Stage mode' })).toBeVisible();
  await expect(dialog2.getByRole('link', { name: 'Watch on YouTube' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(dialog2).toHaveCount(0);
});

test('Settings is a menu, a name change reaches the sidebar, sign-out is under Account', async ({ page }) => {
  await signUpAndIn(page, uniqueEmail('menu'));
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  for (const name of ['Profile', 'Language and region', 'Account', 'About']) {
    await expect(page.getByRole('link', { name })).toBeVisible();
  }
  await expect(page.getByRole('link', { name: 'Admin site' })).toHaveCount(0);

  await page.getByRole('link', { name: 'Profile' }).click();
  await expect(page).toHaveURL(/\/settings\/profile$/);
  await page.getByLabel('Display name').fill('Test Person');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  await expect(page.locator('.side-me')).toContainText('Test Person');
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Welcome, Test Person', level: 1 })).toBeVisible();

  await page.goto('/settings/about');
  await expect(page.getByRole('heading', { name: 'About', level: 1 })).toBeVisible();

  await page.goto('/settings/account');
  await expect(page.getByRole('heading', { name: 'Account', level: 1 })).toBeVisible();
  await expect(page.getByText('Signed in as')).toBeVisible();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login/);
});

test('the Admin site row appears in Settings for an administrator', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/settings');
  await expect(page.getByRole('link', { name: 'Admin site' })).toHaveAttribute('href', '/admin');
});
