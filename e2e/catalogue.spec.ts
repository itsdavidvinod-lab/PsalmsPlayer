// This file runs before site.spec.ts (alphabetical order) on purpose: the "below 10 listeners" check needs a database
// where nobody has opened this artist's songs yet. Re-running locally against the same database will fail that check;
// run `supabase db reset` first.
import { expect, test } from '@playwright/test';
import { SUPABASE_URL, apiHeaders, createApiUser, signUpAndIn, sleep, uniqueEmail } from './helpers';

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

  await page.locator('a[href="/album/morning-light"]').click();
  await expect(page).toHaveURL(/\/album\/morning-light$/);
  await expect(page.getByRole('heading', { name: 'Morning Light', level: 1 })).toBeVisible();
  // Songs Two and Three belong to this album but are hidden, so only Song One is listed.
  await expect(page.getByText('Placeholder Song One', { exact: true })).toBeVisible();
  for (const t of HIDDEN_TITLES) await expect(page.getByText(t)).toHaveCount(0);
  await page.locator('a[href="/artist/grace-worship"]').click();
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
  await expect(page.locator('a[href="/artist/grace-worship"]')).toBeVisible();
  const shalom = page.locator('a[href="/artist/shalom-choir"]');
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
  await expect(page.locator('a[href="/artist/grace-worship"]')).toBeVisible();

  for (const q of ["x' or 1=1 --", '100%', '"; drop table songs; --', '<script>alert(1)</script>']) {
    const res = await page.goto(`/browse?q=${encodeURIComponent(q)}`);
    expect(res?.status(), q).toBe(200);
    await expect(page.getByRole('heading', { name: 'Browse', level: 1 })).toBeVisible();
    await expect(page.getByText('Placeholder Song One')).toHaveCount(0);
  }

  // Symbols only are stripped, which leaves an empty search: the normal list, not an error and not a wildcard match of hidden rows.
  await page.goto('/browse?q=_');
  await expect(page.getByText('Placeholder Song One', { exact: true })).toBeVisible();
  for (const t of HIDDEN_TITLES) await expect(page.getByText(t)).toHaveCount(0);
});

test('monthly listeners count people who really listened for 30+ seconds, not people who opened lyrics', async ({ page, request }) => {
  test.setTimeout(180_000);
  const range = (n: number) => Array.from({ length: n }, (_, i) => i);
  type Beat = { session_id: string; total_s: number; qualified: boolean };
  const beat = async (token: string, session: string | null, seconds: number): Promise<Beat> => {
    const res = await request.post(`${SUPABASE_URL}/rest/v1/rpc/record_listen`, {
      headers: apiHeaders(token),
      data: { p_session: session, p_song: SONG_ONE_ID, p_seconds: seconds },
    });
    expect(res.ok(), 'record_listen should accept a signed-in listener').toBeTruthy();
    return ((await res.json()) as Beat[])[0];
  };

  // Twelve people open the lyrics. Reading is not listening: they must not become listeners.
  const readers = await Promise.all(range(12).map((i) => createApiUser(request, `reader${i}`)));
  await Promise.all(
    readers.map((u) => request.post(`${SUPABASE_URL}/rest/v1/rpc/record_play`, { headers: apiHeaders(u.token), data: { p_song: SONG_ONE_ID, p_kind: 'lyrics_open' } })),
  );

  // Ten people press play and keep listening. One more person runs three sessions at once to try to speed time up.
  const listeners = await Promise.all(range(10).map((i) => createApiUser(request, `listener${i}`)));
  const cheat = await createApiUser(request, 'cheat');
  const started = await Promise.all(listeners.map((u) => beat(u.token, null, 0)));
  const cheatSessions = await Promise.all(range(3).map(() => beat(cheat.token, null, 0)));

  // Claiming 20 seconds the moment a session starts earns (almost) nothing.
  const instant = await beat(listeners[0].token, started[0].session_id, 20);
  expect(instant.total_s, 'time that has not passed cannot be claimed').toBeLessThanOrEqual(1);

  await sleep(16_000);
  // Everyone reports 16 seconds. The cheat reports 16 seconds on all three sessions at the same instant.
  const second = await Promise.all([
    ...listeners.map((u, i) => beat(u.token, started[i].session_id, 16)),
    ...cheatSessions.map((s) => beat(cheat.token, s.session_id, 16)),
  ]);
  const cheatTotal = second.slice(10).reduce((sum, b) => sum + b.total_s, 0);
  expect(cheatTotal, `three parallel sessions must share one clock (credited ${cheatTotal} s for 16 s of real time)`).toBeLessThanOrEqual(20);

  await sleep(16_000);
  const third = await Promise.all(listeners.map((u, i) => beat(u.token, started[i].session_id, 16)));
  for (const b of third) expect(b.qualified, `a listener with ${b.total_s} s should now count`).toBeTruthy();

  await signUpAndIn(page, uniqueEmail('listeners'));
  await page.goto('/artist/grace-worship');
  // 10 real listeners. The 12 readers, the cheat (under 30 s) and anyone else do not count.
  await expect(page.getByText(/monthly listeners/)).toHaveText('10 monthly listeners');
});
