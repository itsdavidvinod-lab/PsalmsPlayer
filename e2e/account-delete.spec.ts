// Deleting your own account (required by Google Play and the App Store): two taps in Settings, everything attached goes,
// the sign-in stops working, and an admin account is refused. Runs on the real Supabase stack.
import { expect, test } from '@playwright/test';
import { ANON_KEY, PASSWORD, SONG_ONE_ID, SUPABASE_URL, signInAsAdmin, signUpAndIn, sql, uniqueEmail } from './helpers';

test('a person deletes their own account and everything attached to it', async ({ page, request }) => {
  const email = uniqueEmail('leaver');
  await signUpAndIn(page, email);
  const userId = sql(`select id from auth.users where email = '${email}'`);
  sql(`insert into public.song_likes (user_id, song_id) values ('${userId}', '${SONG_ONE_ID}')`);
  expect(sql(`select count(*) from public.profiles where id = '${userId}'`)).toBe('1');

  await page.goto('/settings/account');
  await expect(page.getByRole('heading', { name: 'Delete account' })).toBeVisible();
  await page.getByRole('button', { name: 'Delete account' }).click();
  // The first tap only asks. Nothing is deleted yet.
  await expect(page.getByRole('group', { name: 'Confirm account deletion' })).toBeVisible();
  expect(sql(`select count(*) from auth.users where id = '${userId}'`)).toBe('1');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Delete account' })).toBeVisible();

  await page.getByRole('button', { name: 'Delete account' }).click();
  await page.getByRole('button', { name: 'Yes, delete my account' }).click();
  await expect(page).toHaveURL(/\/login\?deleted=1$/);
  await expect(page.getByRole('status').filter({ hasText: 'Your account has been deleted.' })).toBeVisible();

  expect(sql(`select count(*) from auth.users where id = '${userId}'`)).toBe('0');
  expect(sql(`select count(*) from public.profiles where id = '${userId}'`)).toBe('0');
  expect(sql(`select count(*) from public.song_likes where user_id = '${userId}'`)).toBe('0');

  // The sign-in no longer works, and the browser is signed out.
  const again = await request.post(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' },
    data: { email, password: PASSWORD },
  });
  expect(again.ok(), 'a deleted account cannot sign in').toBeFalsy();
  await page.goto('/');
  await expect(page).toHaveURL(/\/login/);
});

test('an admin account cannot be deleted from the app', async ({ page }) => {
  const { email, userId } = await signInAsAdmin(page);
  await page.goto('/settings/account');
  await expect(page.getByText('This is an administrator account, so it cannot be deleted from the app.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete account' })).toHaveCount(0);
  expect(sql(`select count(*) from auth.users where email = '${email}' and id = '${userId}'`)).toBe('1');
});
