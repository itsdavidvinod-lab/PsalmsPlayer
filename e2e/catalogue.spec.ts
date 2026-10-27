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

test('Search offers artists to follow and the latest releases, finds by title, artist, genre and filter, hides the rest, and survives odd search text', async ({ page }) => {
  await signUpAndIn(page, uniqueEmail('search'));
  await page.goto('/search');
  await expect(page.getByRole('heading', { name: 'Search', level: 1 })).toBeVisible();
  // Nobody followed yet: artists to follow (available ones only), then what is new, then ways to explore.
  await expect(page.getByRole('heading', { name: 'Artists to follow' })).toBeVisible();
  await expect(page.locator('a[href="/artist/grace-worship"]')).toBeVisible();
  await expect(page.locator('a[href="/artist/shalom-choir"]')).toHaveCount(0);
  await expect(page.getByText('Draft Artist')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Latest releases' })).toBeVisible();
  await expect(page.getByText('Placeholder Song One', { exact: true })).toBeVisible();
  await expect(page.getByText('Placeholder Single', { exact: true })).toBeVisible();
  await expect(page.getByText('Grace Worship Team · 3d ago')).toBeVisible();
  for (const t of HIDDEN_TITLES) await expect(page.getByText(t)).toHaveCount(0);

  // A tile of Explore opens the songs of that genre.
  await expect(page.getByRole('heading', { name: 'Explore' })).toBeVisible();
  await page.getByRole('link', { name: 'Worship', exact: true }).click();
  await expect(page).toHaveURL(/\/search\?genre=worship$/);
  await expect(page.getByText('Placeholder Song One', { exact: true })).toBeVisible();
  await expect(page.getByText('Placeholder Single')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove filter: Worship' })).toBeVisible();

  // Typing searches as you go, by title and by artist name.
  await page.goto('/search');
  const box = page.getByRole('searchbox', { name: /Search songs/ });
  await box.fill('single');
  await expect(page).toHaveURL(/\/search\?q=single$/);
  await expect(page.getByText('Placeholder Single', { exact: true })).toBeVisible();
  await expect(page.getByText('Placeholder Song One')).toHaveCount(0);
  await box.fill('grace');
  await expect(page).toHaveURL(/\/search\?q=grace$/);
  await expect(page.locator('a[href="/artist/grace-worship"]')).toBeVisible();
  await expect(page.getByText('Placeholder Song One', { exact: true })).toBeVisible();
  await expect(page.getByText('Placeholder Single', { exact: true })).toBeVisible();

  // An unavailable artist can be found by name, as a name only.
  await page.goto('/search?q=shalom');
  await expect(page.locator('a[href="/artist/shalom-choir"]')).toContainText('Unavailable');

  // A word that names a genre finds its songs; a hidden song is still not found.
  await page.goto('/search?q=praise');
  await expect(page.getByText('Placeholder Single', { exact: true })).toBeVisible();
  await expect(page.getByText('Placeholder Song Two')).toHaveCount(0);
  await page.goto('/search?q=hymn');
  await expect(page.getByText('Nothing found.')).toBeVisible();

  // The filter sheet: choosing a language narrows the results, and the chip above takes it off again.
  await page.goto('/search?q=placeholder');
  await page.getByRole('button', { name: /^Filters/ }).click();
  const filters = page.getByRole('dialog', { name: 'Filters' });
  await filters.getByRole('button', { name: 'English', exact: true }).click();
  await expect(page).toHaveURL(/language=en/);
  await page.keyboard.press('Escape');
  await expect(filters).toHaveCount(0);
  await expect(page.getByText('Placeholder Single', { exact: true })).toBeVisible();
  await expect(page.getByText('Placeholder Song One')).toHaveCount(0);
  await page.getByRole('button', { name: 'Remove filter: English' }).click();
  await expect(page).not.toHaveURL(/language=/);
  await expect(page.getByText('Placeholder Song One', { exact: true })).toBeVisible();

  // Language filter: an unavailable artist's languages are not exposed, so Malayalam finds nothing.
  await page.goto('/search?language=ml');
  await expect(page.getByText('Nothing found.')).toBeVisible();
  await page.goto('/search?language=ta');
  await expect(page.locator('a[href="/artist/grace-worship"]')).toBeVisible();

  for (const q of ["x' or 1=1 --", '100%', '"; drop table songs; --', '<script>alert(1)</script>']) {
    const res = await page.goto(`/search?q=${encodeURIComponent(q)}`);
    expect(res?.status(), q).toBe(200);
    await expect(page.getByRole('heading', { name: 'Search', level: 1 })).toBeVisible();
    await expect(page.getByText('Placeholder Song One')).toHaveCount(0);
  }

  // Symbols only are stripped, which leaves an empty search: the browsing screen, not an error and not a wildcard match of hidden rows.
  await page.goto('/search?q=_');
  await expect(page.getByText('Placeholder Song One', { exact: true })).toBeVisible();
  for (const t of HIDDEN_TITLES) await expect(page.getByText(t)).toHaveCount(0);
});

test('an artist page: ranked songs, Follow that is saved, "You liked", and the follow shows in Search and Library', async ({ page }) => {
  await signUpAndIn(page, uniqueEmail('follow'));
  await page.goto('/artist/grace-worship');
  await expect(page.locator('.song-rank')).toHaveText(['1', '2']);

  const follow = page.getByRole('button', { name: 'Follow', exact: true });
  const followed = page.waitForResponse((r) => r.url().includes('/rest/v1/artist_follows') && r.request().method() === 'POST');
  await follow.click();
  expect((await followed).ok(), 'the follow is saved').toBeTruthy();
  await expect(page.getByRole('button', { name: 'Following', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.reload();
  await expect(page.getByRole('button', { name: 'Following', exact: true })).toBeVisible();

  // Like one of the songs: the page then offers the songs of this artist that you like.
  await expect(page.getByText('You liked')).toHaveCount(0);
  const liked = page.waitForResponse((r) => r.url().includes('/rest/v1/song_likes') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Like Placeholder Song One', exact: true }).click();
  expect((await liked).ok(), 'the like is saved').toBeTruthy();
  await page.reload();
  const card = page.getByRole('link', { name: /You liked/ });
  await expect(card).toContainText('1 song · Grace Worship Team');
  await card.click();
  await expect(page).toHaveURL(/\/library\/liked\?artist=grace-worship$/);
  await expect(page.getByText('1 song · Grace Worship Team')).toBeVisible();
  await expect(page.locator('.song-row')).toHaveCount(1);
  await page.getByRole('link', { name: 'All liked songs' }).click();
  await expect(page).toHaveURL(/\/library\/liked$/);

  // The follow shows in Search (instead of "Artists to follow") and in Library.
  await page.goto('/search');
  await expect(page.getByRole('heading', { name: 'Followed artists' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Artists to follow' })).toHaveCount(0);
  await expect(page.locator('a[href="/artist/grace-worship"]')).toBeVisible();
  await expect(page.getByRole('link', { name: 'See more' })).toHaveCount(0); // only when more than eight are followed
  await page.goto('/library');
  await expect(page.getByRole('heading', { name: 'Following' })).toBeVisible();
  await expect(page.getByRole('link', { name: /Grace Worship Team/ })).toBeVisible();
  await page.getByRole('link', { name: 'Artists', exact: true }).click();
  await expect(page).toHaveURL(/\/library\?tab=artists$/);
  await expect(page.getByRole('heading', { name: 'Lists' })).toHaveCount(0);
  await page.getByRole('link', { name: 'Lists', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Following' })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Liked songs/ })).toBeVisible();

  // Stop following.
  await page.goto('/artist/grace-worship');
  const unfollowed = page.waitForResponse((r) => r.url().includes('/rest/v1/artist_follows') && r.request().method() === 'DELETE');
  await page.getByRole('button', { name: 'Following', exact: true }).click();
  expect((await unfollowed).ok(), 'the unfollow is saved').toBeTruthy();
  await expect(page.getByRole('button', { name: 'Follow', exact: true })).toHaveAttribute('aria-pressed', 'false');
  await page.goto('/library?tab=artists');
  await expect(page.getByText('You are not following any artist yet.')).toBeVisible();
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
