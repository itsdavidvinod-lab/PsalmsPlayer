// This file runs before site.spec.ts (alphabetical order) on purpose: the "below 10 listeners" check needs a database
// where nobody has opened this artist's songs yet. Re-running locally against the same database will fail that check;
// run `supabase db reset` first.
import { expect, test } from '@playwright/test';
import { SUPABASE_URL, apiHeaders, createApiUser, signUpAndIn, uniqueEmail } from './helpers';

const HIDDEN_TITLES = ['Placeholder Song Two', 'Placeholder Song Three', 'Placeholder Hymn', 'Placeholder Takedown'];
const SONG_ONE_ID = 'd0000000-0000-0000-0000-000000000001';

test.describe.configure({ mode: 'serial' });

test('an available artist shows songs, albums and bio, but no listener count below 10', async ({ page }) => {
  await signUpAndIn(page, uniqueEmail('artist'));
  await page.goto('/artist/grace-worship');
  await expect(page.getByRole('heading', { name: 'Grace Worship Team', level: 1 })).toBeVisible();
  await expect(page.getByText('Placeholder bio.')).toBeVisible();
  await expect(page.getByText('Placeholder Song One', { exact: true })).toBeVisible();
  await expect(page.getByText('Placeholder Single', { exact: true })).toBeVisible();
  for (const t of HIDDEN_TITLES) await expect(page.getByText(t)).toHaveCount(0);
  await expect(page.getByText('monthly listeners')).toHaveCount(0);

  await page.getByRole('link', { name: /Morning Light/ }).click();
  await expect(page).toHaveURL(/\/album\/morning-light$/);
  await expect(page.getByRole('heading', { name: 'Morning Light', level: 1 })).toBeVisible();
  // Songs Two and Three belong to this album but are hidden, so only Song One is listed.
  await expect(page.getByText('Placeholder Song One', { exact: true })).toBeVisible();
  for (const t of HIDDEN_TITLES) await expect(page.getByText(t)).toHaveCount(0);
  await page.getByRole('link', { name: 'Grace Worship Team' }).click();
  await expect(page).toHaveURL(/\/artist\/grace-worship$/);
});

test('an artist with an expired agreement shows as Unavailable with nothing else', async ({ page }) => {
  await signUpAndIn(page, uniqueEmail('unavail'));
  const res = await page.goto('/artist/shalom-choir');
  expect(res?.status()).toBe(200);
  await expect(page.getByRole('heading', { name: 'Shalom Choir', level: 1 })).toBeVisible();
  await expect(page.getByText('Unavailable', { exact: true })).toBeVisible();
  await expect(page.getByText("This artist's songs are not available right now.")).toBeVisible();
  const html = await page.content();
  for (const leak of ['Placeholder bio.', 'Placeholder Hymn', 'Evening Hymns', 'shalom.jpg', 'monthly listeners']) {
    expect(html, `unavailable artist page must not contain "${leak}"`).not.toContain(leak);
  }
  expect(html).not.toMatch(/expir/i);

  // Their album and songs are gone, and an unpublished artist does not exist for users.
  expect((await page.goto('/album/evening-hymns'))?.status()).toBe(404);
  expect((await page.goto('/song/placeholder-hymn'))?.status()).toBe(404);
  expect((await page.goto('/artist/draft-artist'))?.status()).toBe(404);
});

test('Browse lists live songs and artists, hides the rest, and survives odd search text', async ({ page }) => {
  await signUpAndIn(page, uniqueEmail('browse'));
  await page.goto('/browse');
  await expect(page.getByRole('link', { name: /Grace Worship Team/ })).toBeVisible();
  const shalom = page.getByRole('link', { name: /Shalom Choir/ });
  await expect(shalom).toContainText('Unavailable');
  await expect(page.getByText('Draft Artist')).toHaveCount(0);
  await expect(page.getByText('Placeholder Song One', { exact: true })).toBeVisible();
  await expect(page.getByText('Placeholder Single', { exact: true })).toBeVisible();
  for (const t of HIDDEN_TITLES) await expect(page.getByText(t)).toHaveCount(0);

  await page.goto('/browse?q=single');
  await expect(page.getByText('Placeholder Single', { exact: true })).toBeVisible();
  await expect(page.getByText('Placeholder Song One')).toHaveCount(0);

  // A hidden song cannot be found by searching for it.
  await page.goto('/browse?q=hymn');
  await expect(page.getByText('Nothing found.')).toBeVisible();

  // Language filter: an unavailable artist's languages are not exposed, so Malayalam finds nothing.
  await page.goto('/browse?language=ml');
  await expect(page.getByText('Nothing found.')).toBeVisible();
  await page.goto('/browse?language=ta');
  await expect(page.getByRole('link', { name: /Grace Worship Team/ })).toBeVisible();

  for (const q of ["x' or 1=1 --", '100%', '_', '"; drop table songs; --', '<script>alert(1)</script>']) {
    const res = await page.goto(`/browse?q=${encodeURIComponent(q)}`);
    expect(res?.status(), q).toBe(200);
    await expect(page.getByRole('heading', { name: 'Browse', level: 1 })).toBeVisible();
    await expect(page.getByText('Placeholder Song One')).toHaveCount(0);
  }
});

test('monthly listeners appear once 10 different signed-in people have opened the artist\'s songs', async ({ page, request }) => {
  for (let i = 0; i < 10; i++) {
    const u = await createApiUser(request, `listener${i}`);
    const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/record_play`, {
      headers: apiHeaders(u.token),
      data: { p_song: SONG_ONE_ID, p_kind: 'lyrics_open' },
    });
    expect(res.ok(), 'record_play should accept a signed-in listener').toBeTruthy();
  }
  // The same person opening the song again within 30 minutes must not count twice.
  const again = await createApiUser(request, 'repeat');
  for (let i = 0; i < 3; i++) {
    await request.post(`${SUPABASE_URL}/rest/v1/rpc/record_play`, { headers: apiHeaders(again.token), data: { p_song: SONG_ONE_ID, p_kind: 'lyrics_open' } });
  }

  await signUpAndIn(page, uniqueEmail('listeners'));
  await page.goto('/artist/grace-worship');
  const text = await page.getByText(/monthly listeners/).innerText();
  const n = Number(text.replace(/[^\d]/g, ''));
  expect(n, text).toBe(11); // ten listeners + the one who opened it three times, counted once
});
