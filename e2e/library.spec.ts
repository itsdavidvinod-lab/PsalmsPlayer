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
  await page.getByRole('button', { name: 'New list' }).click();
  const dialog = page.getByRole('dialog', { name: 'New list' });
  await dialog.getByLabel('New list name').fill('Sunday service');
  await dialog.getByLabel('Type').selectOption('setlist');
  await dialog.getByLabel('Service date (optional)').fill('2030-01-06');
  await dialog.getByRole('button', { name: 'Create list' }).click();
  await expect(page).toHaveURL(/\/library\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'Sunday service', level: 1 })).toBeVisible();
  await expect(page.getByText('Setlist · 2030-01-06 · 0 songs')).toBeVisible();
  await expect(page.getByText('No songs yet')).toBeVisible();
  const listUrl = page.url();

  // Add two songs from their own pages.
  for (const slug of ['placeholder-song-one', 'placeholder-single']) {
    await page.goto(`/song/${slug}/lyrics`);
    await page.getByRole('button', { name: 'Add to list' }).click();
    await page.getByRole('button', { name: /^Sunday service/ }).click();
    await expect(page.getByRole('status').filter({ hasText: 'Added to Sunday service.' })).toBeVisible();
  }

  await page.goto('/library');
  await expect(page.getByText('Setlist · 2030-01-06 · 2 songs')).toBeVisible();
  await page.goto(listUrl);
  const titles = page.locator('.song-row .song-title');
  await expect(titles).toHaveText(['Placeholder Song One', 'Placeholder Single']);
  // A setlist shows each song's key under its title.
  await expect(page.getByText('Grace Worship Team · Key G')).toBeVisible();

  // Reorder (in Edit): the new order survives a reload (it is saved, not just shown).
  // The page updates at once and saves in the background, so wait for the save before reloading.
  await page.getByRole('button', { name: 'Edit list' }).click();
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/rpc/reorder_playlist') && r.ok()),
    page.getByRole('button', { name: 'Move Placeholder Single up' }).click(),
  ]);
  await expect(titles).toHaveText(['Placeholder Single', 'Placeholder Song One']);
  await page.reload();
  await expect(titles).toHaveText(['Placeholder Single', 'Placeholder Song One']);
  await page.getByRole('button', { name: 'Edit list' }).click();
  await expect(page.getByRole('button', { name: 'Move Placeholder Single up' })).toBeDisabled();

  // A key for this service only: the song itself is not changed.
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/rest/v1/playlist_items') && r.request().method() === 'PATCH' && r.ok()),
    page.getByLabel('Key for Placeholder Song One').selectOption('A'),
  ]);
  await page.reload();
  await expect(page.getByText('Grace Worship Team · Key A')).toBeVisible();
  await page.getByRole('button', { name: 'Edit list' }).click();
  await expect(page.getByLabel('Key for Placeholder Song One')).toHaveValue('A');

  // Rename and change the date.
  await page.getByLabel('Name', { exact: true }).fill('Sunday 6 January');
  await page.getByLabel('Service date').fill('2030-01-13');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Sunday 6 January', level: 1 })).toBeVisible();
  await expect(page.getByText('Setlist · 2030-01-13 · 2 songs')).toBeVisible();

  // Remove a song.
  await Promise.all([
    page.waitForResponse((r) => r.url().includes('/rest/v1/playlist_items') && r.request().method() === 'DELETE' && r.ok()),
    page.getByRole('button', { name: 'Remove Placeholder Single' }).click(),
  ]);
  await expect(titles).toHaveText(['Placeholder Song One']);
  await page.reload();
  await expect(titles).toHaveText(['Placeholder Song One']);

  // Delete the list.
  await page.getByRole('button', { name: 'Edit list' }).click();
  await page.getByRole('button', { name: 'Delete list' }).click();
  await page.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(page).toHaveURL(/\/library$/);
  await expect(page.getByText('Sunday 6 January')).toHaveCount(0);
  expect((await page.goto(listUrl))?.status()).toBe(404);
});

test('a quick new playlist from a song page, and the Library shows it next to Liked songs', async ({ page }) => {
  await signUpAndIn(page, uniqueEmail('quick'));
  // The lyrics page works the same whether or not the song has an audio file.
  await page.goto('/song/placeholder-song-one/lyrics');
  const liked = page.waitForResponse((r) => r.url().includes('/rest/v1/song_likes') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Like', exact: true }).click();
  expect((await liked).ok(), 'the like is saved').toBeTruthy();
  await expect(page.getByRole('button', { name: 'Liked', exact: true })).toHaveAttribute('aria-pressed', 'true');

  // "Add to list" is in the ⋮ menu.
  await page.getByRole('button', { name: 'More options for Placeholder Song One' }).click();
  // The song page also has its own "Add to list" button, so the menu item is found inside the open menu.
  const menu = page.getByRole('dialog', { name: 'Options for Placeholder Song One' });
  await menu.getByRole('button', { name: 'Add to list' }).click();
  await menu.getByLabel('New playlist').fill('Morning songs');
  await menu.getByRole('button', { name: 'Create and add' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Added to Morning songs.' })).toBeVisible();

  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Your Library', level: 1 })).toBeVisible();
  await expect(page.getByText('Playlist · 1 song', { exact: true })).toBeVisible();
  await expect(page.getByText('List · 1 song', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: /Liked songs/ }).click();
  await expect(page).toHaveURL(/\/library\/liked$/);
  await expect(page.getByText('Placeholder Song One', { exact: true })).toBeVisible();
});

test('in Liked songs: find, filter by language or genre, and sort', async ({ page }) => {
  await signUpAndIn(page, uniqueEmail('liked-tools'));
  await page.goto('/search?q=placeholder');
  // Like the single first, then Song One, so "recently liked" has Song One on top.
  for (const title of ['Placeholder Single', 'Placeholder Song One']) {
    const saved = page.waitForResponse((r) => r.url().includes('/rest/v1/song_likes') && r.request().method() === 'POST');
    await page.getByRole('button', { name: `Like ${title}`, exact: true }).click();
    expect((await saved).ok()).toBeTruthy();
  }

  await page.goto('/library/liked');
  const titles = page.locator('.song-row .song-title');
  await expect(titles).toHaveText(['Placeholder Song One', 'Placeholder Single']);
  await expect(page.getByText('2 songs', { exact: true })).toBeVisible();

  // Find, by title and by artist.
  const find = page.getByRole('searchbox', { name: 'Find in Liked songs' });
  await find.fill('single');
  await expect(titles).toHaveText(['Placeholder Single']);
  await find.fill('grace');
  await expect(titles).toHaveCount(2);
  await find.fill('nothing like this');
  await expect(page.getByText('No songs match.')).toBeVisible();
  await find.fill('');
  await expect(titles).toHaveCount(2);

  // Chips: the languages and genres that really occur in this list.
  const chips = page.getByRole('group', { name: 'Filter this list' });
  await expect(chips.getByRole('button')).toHaveText(['English', 'Tamil', 'Praise', 'Worship']);
  await chips.getByRole('button', { name: 'Tamil' }).click();
  await expect(titles).toHaveText(['Placeholder Song One']);
  await chips.getByRole('button', { name: 'English' }).click(); // Tamil or English
  await expect(titles).toHaveCount(2);
  await chips.getByRole('button', { name: 'Praise' }).click(); // (Tamil or English) and Praise
  await expect(titles).toHaveText(['Placeholder Single']);
  await chips.getByRole('button', { name: 'Praise' }).click();
  await chips.getByRole('button', { name: 'Tamil' }).click();
  await chips.getByRole('button', { name: 'English' }).click();
  await expect(titles).toHaveCount(2);

  // Sort.
  await page.getByRole('button', { name: 'Sort' }).click();
  const sort = page.getByRole('dialog', { name: 'Sort' });
  await sort.getByRole('button', { name: 'Title' }).click();
  await expect(sort).toHaveCount(0);
  await expect(titles).toHaveText(['Placeholder Single', 'Placeholder Song One']);
  await page.getByRole('button', { name: 'Sort' }).click();
  await page.getByRole('dialog', { name: 'Sort' }).getByRole('button', { name: 'Recently liked' }).click();
  await expect(titles).toHaveText(['Placeholder Song One', 'Placeholder Single']);
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
