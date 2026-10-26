// Library: liked songs, playlists and setlists. Runs on the real Supabase stack with real sign-ups.
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { SUPABASE_URL, apiHeaders, createApiUser, signUpAndIn, sql, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial' });

const SONG_ONE = 'd0000000-0000-0000-0000-000000000001';
const SONG_TWO_HIDDEN = 'd0000000-0000-0000-0000-000000000002';

test('make a setlist, add songs from their pages, reorder, choose a key, rename, remove and delete', async ({ page }) => {
  await signUpAndIn(page, uniqueEmail('library'));

  await page.goto('/library');
  await expect(page.getByText('No lists yet')).toBeVisible();
  await page.getByLabel('New list name').fill('Sunday service');
  await page.getByLabel('Type').selectOption('setlist');
  await page.getByLabel('Service date (optional)').fill('2030-01-06');
  await page.getByRole('button', { name: 'Create list' }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Sunday service', level: 1 })).toBeVisible();
  await expect(page.getByText('Setlist · 2030-01-06 · 0 songs')).toBeVisible();
  await expect(page.getByText('No songs yet')).toBeVisible();
  const listUrl = page.url();

  // Add two songs from their own pages.
  for (const slug of ['placeholder-song-one', 'placeholder-single']) {
    await page.goto(`/song/${slug}`);
    await page.getByRole('button', { name: 'Add to list' }).click();
    await page.getByRole('button', { name: /^Sunday service/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Added to Sunday service.' })).toBeVisible();
  }

  await page.goto('/library');
  await expect(page.getByText('Setlist · 2030-01-06 · 2 songs')).toBeVisible();
  await page.goto(listUrl);
  const titles = page.locator('.song-row .song-title');
  await expect(titles).toHaveText(['Placeholder Song One', 'Placeholder Single']);

  // Reorder: the new order survives a reload (it is saved, not just shown).
  await page.getByRole('button', { name: 'Move Placeholder Single up' }).click();
  await expect(titles).toHaveText(['Placeholder Single', 'Placeholder Song One']);
  await page.reload();
  await expect(titles).toHaveText(['Placeholder Single', 'Placeholder Song One']);
  await expect(page.getByRole('button', { name: 'Move Placeholder Single up' })).toBeDisabled();

  // A key for this service only: the song itself is not changed.
  await page.getByLabel('Key for Placeholder Song One').selectOption('A');
  await page.reload();
  await expect(page.getByLabel('Key for Placeholder Song One')).toHaveValue('A');

  // Rename and change the date.
  await page.getByText('Edit this list').click();
  await page.getByLabel('Name', { exact: true }).fill('Sunday 6 January');
  await page.getByLabel('Service date').fill('2030-01-13');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Sunday 6 January', level: 1 })).toBeVisible();
  await expect(page.getByText('Setlist · 2030-01-13 · 2 songs')).toBeVisible();

  // Remove a song.
  await page.getByRole('button', { name: 'Remove Placeholder Single' }).click();
  await expect(titles).toHaveText(['Placeholder Song One']);
  await page.reload();
  await expect(titles).toHaveText(['Placeholder Song One']);

  // Delete the list.
  await page.getByText('Edit this list').click();
  await page.getByRole('button', { name: 'Delete list' }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByText('Sunday 6 January')).toHaveCount(0);
  expect((await page.goto(listUrl))?.status()).toBe(404);
});

test('a quick new playlist from a song page, and liked songs show in the Library', async ({ page }) => {
  await signUpAndIn(page, uniqueEmail('quick'));
  await page.goto('/song/placeholder-song-one');
  await page.getByRole('button', { name: '♡ Like' }).click();
  await expect(page.getByRole('button', { name: '♥ Liked' })).toBeVisible();

  await page.getByRole('button', { name: 'Add to list' }).click();
  await page.getByLabel('New playlist').fill('Morning songs');
  await page.getByRole('button', { name: 'Create and add' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Added to Morning songs.' })).toBeVisible();

  await page.goto('/library');
  await expect(page.getByText('Playlist · 1 songs')).toBeVisible();
  await expect(page.locator('section[aria-labelledby="liked"]').getByText('Placeholder Song One', { exact: true })).toBeVisible();
});

test('a song that is not available keeps its slot but never shows its title', async ({ page }) => {
  const email = uniqueEmail('slot');
  await signUpAndIn(page, email);
  const uid = sql(`select id from auth.users where email = '${email}'`);
  const list = randomUUID();
  sql(`insert into public.playlists (id, user_id, name, kind) values ('${list}', '${uid}', 'Mixed', 'setlist')`);
  sql(`insert into public.playlist_items (playlist_id, song_id, position) values ('${list}', '${SONG_ONE}', 1), ('${list}', '${SONG_TWO_HIDDEN}', 2)`);

  await page.goto(`/library/${list}`);
  await expect(page.getByText('Setlist · 2 songs')).toBeVisible();
  await expect(page.locator('.song-row')).toHaveCount(2);
  await expect(page.locator('.song-row').nth(1)).toContainText('Not available right now');
  const html = await page.content();
  expect(html).not.toContain('Placeholder Song Two');
  expect(html).not.toContain('Hidden placeholder line');
});

test('lists are private: another person gets "not available", and the API shows them nothing', async ({ page, request }) => {
  const owner = await createApiUser(request, 'owner');
  const list = randomUUID();
  const made = await request.post(`${SUPABASE_URL}/rest/v1/playlists`, {
    headers: { ...apiHeaders(owner.token), Prefer: 'return=minimal' },
    data: { id: list, user_id: owner.userId, name: 'Secret list' },
  });
  expect(made.ok()).toBeTruthy();

  await signUpAndIn(page, uniqueEmail('stranger'));
  const res = await page.goto(`/library/${list}`);
  expect(res?.status()).toBe(404);
  await expect(page.getByRole('heading', { name: 'Not available' })).toBeVisible();
  expect(await page.content()).not.toContain('Secret list');
  expect((await page.goto(`/stage/setlist/${list}`))?.status()).toBe(404);

  const stranger = await createApiUser(request, 'stranger-api');
  const peek = await request.get(`${SUPABASE_URL}/rest/v1/playlists?id=eq.${list}&select=*`, { headers: apiHeaders(stranger.token) });
  expect(await peek.json()).toEqual([]);
  const add = await request.post(`${SUPABASE_URL}/rest/v1/rpc/add_to_playlist`, { headers: apiHeaders(stranger.token), data: { p_playlist: list, p_song: SONG_ONE } });
  expect(add.ok(), "nobody can add to someone else's list").toBeFalsy();
  const hidden = await request.post(`${SUPABASE_URL}/rest/v1/rpc/add_to_playlist`, { headers: apiHeaders(owner.token), data: { p_playlist: list, p_song: SONG_TWO_HIDDEN } });
  expect(hidden.ok(), 'a hidden song cannot be added even to your own list').toBeFalsy();
});
