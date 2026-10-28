// Admin site: who can open it, what the dashboard shows, and creating and editing artists and albums.
// Runs on the real Supabase stack. Anything created here is deleted again so the other specs see the seed data only.
import { expect, test } from '@playwright/test';
import { signInAsAdmin, signUpAndIn, sql, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial' });

const SEED_ARTIST_ID = 'a0000000-0000-0000-0000-000000000001';

test.afterAll(() => {
  sql(`delete from public.artists where slug like 'e2e-artist-%'`);
});

test('signed-out visitors go to login and ordinary users get the same "not available" page as for a missing address', async ({ page }) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin$/);

  await signUpAndIn(page, uniqueEmail('plain-user'));
  for (const path of ['/admin', '/admin/artists', '/admin/artists/new', `/admin/artists/${SEED_ARTIST_ID}`, '/admin/requests', '/admin/requests/new', '/admin/posters', '/admin/posters/new', '/admin/lists']) {
    await page.goto(path);
    await expect(page.getByRole('heading', { name: 'Not available' }), path).toBeVisible();
    await expect(page.getByText('Dashboard'), path).toHaveCount(0);
    await expect(page.getByText('Grace Worship Team'), path).toHaveCount(0);
  }

  // Settings offers no way in to someone who is not an admin.
  await page.goto('/settings');
  await expect(page.getByRole('heading', { name: 'Settings', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: 'Admin site' })).toHaveCount(0);
});

test('an admin sees the dashboard with the reason each hidden song is hidden', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/settings');
  await page.getByRole('link', { name: 'Admin site' }).click();
  await expect(page).toHaveURL(/\/admin$/);
  await expect(page.getByRole('heading', { name: 'Dashboard', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Expiring within 60 days' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Songs that are not live' })).toBeVisible();

  // Seed: one song is hidden by an incomplete agreement, one was taken down. The admin sees why; users never do.
  await expect(page.getByText('No verified agreement in force').first()).toBeVisible();
  await expect(page.getByText('Taken down by an admin').first()).toBeVisible();

  await page.getByRole('link', { name: 'Artists', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Artists', level: 1 })).toBeVisible();
  await expect(page.getByRole('link', { name: /Grace Worship Team/ })).toBeVisible();
});

test('create an artist, edit it, add an album, and every change is recorded with who made it', async ({ page }) => {
  const { userId } = await signInAsAdmin(page);
  const slug = `e2e-artist-${Date.now()}`;

  await page.goto('/admin/artists/new');
  await page.getByLabel('Name', { exact: true }).fill('E2E Test Artist');
  await expect(page.getByLabel('Address (slug)')).toHaveValue('e2e-test-artist'); // suggested from the name
  await page.getByLabel('Address (slug)').fill(slug);
  await page.getByRole('button', { name: 'Create artist' }).click();
  await expect(page).toHaveURL(/\/admin\/artists\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'E2E Test Artist', level: 1 })).toBeVisible();

  const artistId = sql(`select id from public.artists where slug = '${slug}'`);
  expect(artistId).toMatch(/^[0-9a-f-]{36}$/);
  expect(sql(`select is_published from public.artists where id = '${artistId}'`)).toBe('f');
  expect(sql(`select count(*) from public.audit_log where entity = 'artists' and entity_id = '${artistId}' and action = 'INSERT' and actor = '${userId}'`)).toBe('1');

  // Edit: the change is saved, survives a reload, and is audited.
  await page.getByLabel('About').fill('Written by the e2e test.');
  await page.getByRole('group', { name: 'Languages' }).getByLabel('Tamil').check();
  await page.getByRole('group', { name: 'Genres' }).getByLabel('Worship', { exact: true }).check();
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('About')).toHaveValue('Written by the e2e test.');
  expect(sql(`select bio || '|' || language_codes::text || '|' || genres::text from public.artists where id = '${artistId}'`)).toBe('Written by the e2e test.|{ta}|{worship}');
  expect(sql(`select count(*) from public.audit_log where entity = 'artists' and entity_id = '${artistId}' and action = 'UPDATE' and actor = '${userId}'`)).toBe('1');

  // An unpublished artist is not visible to users at all.
  expect(sql(`select count(*) from public.v_artists where id = '${artistId}'`)).toBe('0');

  // Album: added from the artist page.
  await page.getByText('Add an album').click();
  await page.locator('#album-new-title').fill('E2E Album');
  await expect(page.locator('#album-new-slug')).toHaveValue('e2e-album');
  await page.locator('#album-new-slug').fill(`${slug}-album`);
  await page.locator('#album-new-year').fill('2031');
  await page.getByRole('button', { name: 'Add album' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Album added.' })).toBeVisible();
  await expect(page.locator('summary', { hasText: 'E2E Album' })).toBeVisible();
  expect(sql(`select title || '|' || release_year || '|' || kind || '|' || is_published from public.albums where artist_id = '${artistId}'`)).toBe('E2E Album|2031|album|false');
});

test('bad input is stopped with a plain message: a taken address, an invalid address, an insecure picture link, a bad year', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin/artists/new');

  await page.getByLabel('Name', { exact: true }).fill('Duplicate');
  await page.getByLabel('Address (slug)').fill('grace-worship'); // the seed artist already has this address
  await page.getByRole('button', { name: 'Create artist' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'already uses' })).toBeVisible();

  await page.getByLabel('Address (slug)').fill('Bad Address!');
  await page.getByRole('button', { name: 'Create artist' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'lowercase letters' })).toBeVisible();

  await page.getByLabel('Address (slug)').fill(`e2e-artist-bad-${Date.now()}`);
  await page.locator('#artist-photo').fill('http://example.org/a.jpg');
  await page.getByRole('button', { name: 'Create artist' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'https://' })).toBeVisible();
  expect(sql(`select count(*) from public.artists where name = 'Duplicate'`)).toBe('0');

  // Album year outside the allowed range is refused before anything is saved.
  await page.goto(`/admin/artists/${SEED_ARTIST_ID}`);
  await page.getByText('Add an album').click();
  await page.locator('#album-new-title').fill('Year Test');
  await page.locator('#album-new-year').fill('1700');
  await page.getByRole('button', { name: 'Add album' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'between 1900 and 2100' })).toBeVisible();
  expect(sql(`select count(*) from public.albums where title = 'Year Test'`)).toBe('0');
});
