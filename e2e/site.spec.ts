import { expect, test } from '@playwright/test';
import { ANON_KEY, SUPABASE_URL, apiHeaders, passwordToken, signUpAndIn, uniqueEmail } from './helpers';

const HIDDEN_TITLES = ['Placeholder Song Two', 'Placeholder Song Three', 'Placeholder Hymn', 'Placeholder Takedown'];
const HIDDEN_SLUGS = ['placeholder-song-two', 'placeholder-song-three', 'placeholder-hymn', 'placeholder-takedown', 'no-such-song'];

test.describe.configure({ mode: 'serial' });

test('a visitor who is not signed in is sent to the login page', async ({ page }) => {
  await page.goto('/');
  await expect(page).toHaveURL(/\/login\?next=%2F$/);
  await page.goto('/song/placeholder-song-one');
  await expect(page).toHaveURL(/\/login\?next=%2Fsong%2Fplaceholder-song-one$/);
  await page.goto('/get?song=placeholder-song-one');
  await expect(page.getByRole('link', { name: 'Open this song' })).toBeVisible();
});

test('the Google button starts a Google sign-in that returns to the callback and the page asked for', async ({ page }) => {
  let authorizeUrl = '';
  await page.route('**/auth/v1/authorize**', (route) => {
    authorizeUrl = route.request().url();
    return route.fulfill({ status: 200, contentType: 'text/html', body: '<html><body>google stub</body></html>' });
  });
  await page.goto('/login?next=%2Fsong%2Fplaceholder-song-one');
  await page.getByRole('button', { name: 'Continue with Google' }).click();
  await expect(page.getByText('google stub')).toBeVisible();
  const u = new URL(authorizeUrl);
  expect(u.searchParams.get('provider')).toBe('google');
  expect(u.searchParams.get('redirect_to')).toBe('http://localhost:3000/auth/callback?next=%2Fsong%2Fplaceholder-song-one');
});

test('Home shows only live songs and only posters that are running', async ({ page }) => {
  await signUpAndIn(page, uniqueEmail('home'));
  for (const title of ['Placeholder Song One', 'Placeholder Single']) {
    await expect(page.getByText(title, { exact: true }).first()).toBeVisible();
  }
  for (const title of HIDDEN_TITLES) await expect(page.getByText(title)).toHaveCount(0);

  // No language or region chosen yet: only "everyone" posters that are inside their window.
  await expect(page.locator('.poster-cap strong')).toHaveText(['Poster everyone']);
  await expect(page.getByText('Choose your language and region')).toBeVisible();
});

test('choosing language and region in Settings changes the posters on Home', async ({ page }) => {
  await signUpAndIn(page, uniqueEmail('settings'));
  await page.goto('/settings');
  await page.getByLabel('Tamil').check();
  await page.getByLabel('Region').selectOption('IN-TN');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();

  await page.goto('/');
  // Matching both language and region ranks first; "everyone" follows; the Hindi-or-Maharashtra poster stays out.
  await expect(page.locator('.poster-cap strong')).toHaveText(['Poster both', 'Poster everyone']);
});

test('a live song shows lyrics, transposes, links out to YouTube and can be liked', async ({ page }) => {
  await signUpAndIn(page, uniqueEmail('song'));
  await page.goto('/song/placeholder-song-one');
  await expect(page.getByRole('heading', { name: 'Placeholder Song One' })).toBeVisible();
  await expect(page.getByText('Placeholder line one of the')).toBeVisible();
  // YouTube is a link out only: nothing from YouTube is embedded in the page.
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Watch on YouTube' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

  // Transpose from G up two semitones to A; the first chord on screen follows.
  await expect(page.locator('.seg-chord').first()).toHaveText('G');
  await page.getByRole('button', { name: 'Up one semitone' }).click();
  await page.getByRole('button', { name: 'Up one semitone' }).click();
  await expect(page.getByText('Key A', { exact: true })).toBeVisible();
  await expect(page.locator('.seg-chord').first()).toHaveText('A');

  await page.getByRole('button', { name: 'Hide chords' }).click();
  await expect(page.locator('.seg-chord')).toHaveCount(0);

  // The Romanized and Meaning versions are allowed by this artist's agreement.
  await page.getByRole('button', { name: 'Meaning' }).click();
  await expect(page.getByText('Placeholder meaning line one')).toBeVisible();

  await page.getByRole('button', { name: '♡ Like' }).click();
  await expect(page.getByRole('button', { name: '♥ Liked' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('button', { name: '♥ Liked' })).toBeVisible();
  await page.getByRole('button', { name: '♥ Liked' }).click();
  await expect(page.getByRole('button', { name: '♡ Like' })).toBeVisible();
});

test('a live song whose YouTube link failed its check has no YouTube link', async ({ page }) => {
  await signUpAndIn(page, uniqueEmail('single'));
  await page.goto('/song/placeholder-single');
  await expect(page.getByRole('heading', { name: 'Placeholder Single' })).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Watch on YouTube' })).toHaveCount(0);
  expect(await page.content()).not.toContain('abcdefghijk');
});

test('hidden songs look exactly like songs that do not exist', async ({ page }) => {
  await signUpAndIn(page, uniqueEmail('hidden'));
  const bodies = new Set<string>();
  for (const slug of HIDDEN_SLUGS) {
    const res = await page.goto(`/song/${slug}`);
    expect(res?.status(), slug).toBe(404);
    await expect(page.getByRole('heading', { name: 'Not available' })).toBeVisible();
    const html = await page.content();
    for (const t of HIDDEN_TITLES) expect(html, `${slug} must not leak "${t}"`).not.toContain(t);
    expect(html).not.toContain('Hidden placeholder line');
    bodies.add(await page.locator('main, .wrap').first().innerText());
  }
  expect(bodies.size, 'every hidden or unknown slug shows the same text').toBe(1);
});

test('the API refuses what the screens never offer', async ({ request }) => {
  const denied = (s: number) => [401, 403].includes(s);

  // Anonymous callers: catalogue views show live songs only; raw tables, agreements and lyrics are closed.
  const songs = await request.get(`${SUPABASE_URL}/rest/v1/v_songs?select=title&order=title`, { headers: apiHeaders() });
  expect(songs.ok()).toBeTruthy();
  expect(((await songs.json()) as { title: string }[]).map((r) => r.title)).toEqual(['Placeholder Single', 'Placeholder Song One']);

  for (const table of ['songs', 'lyrics', 'agreements', 'requests', 'posters', 'audit_log', 'play_events']) {
    const res = await request.get(`${SUPABASE_URL}/rest/v1/${table}?select=*`, { headers: apiHeaders() });
    expect(denied(res.status()), `anon must not read ${table} (got ${res.status()})`).toBeTruthy();
  }
  const lyrics = await request.post(`${SUPABASE_URL}/rest/v1/rpc/get_lyrics`, {
    headers: apiHeaders(),
    data: { p_song: 'd0000000-0000-0000-0000-000000000001' },
  });
  expect(lyrics.ok(), 'anonymous lyrics call must fail').toBeFalsy();
  expect(await lyrics.text()).not.toContain('Placeholder line one');

  // A signed-in user cannot read hidden songs' lyrics, cannot see agreements, and cannot make themselves admin.
  const email = uniqueEmail('api');
  const signup = await request.post(`${SUPABASE_URL}/auth/v1/signup`, { headers: { apikey: ANON_KEY, 'Content-Type': 'application/json' }, data: { email, password: 'e2e-password-123' } });
  expect(signup.ok()).toBeTruthy();
  const { token, userId } = await passwordToken(request, email);

  const hiddenLyrics = await request.post(`${SUPABASE_URL}/rest/v1/rpc/get_lyrics`, {
    headers: apiHeaders(token),
    data: { p_song: 'd0000000-0000-0000-0000-000000000002' },
  });
  expect(await hiddenLyrics.text()).not.toContain('Hidden placeholder');

  // Admin-only tables: a normal user gets either a refusal or no rows at all. Never data.
  for (const table of ['songs', 'lyrics', 'agreements', 'requests', 'posters', 'song_credits', 'audit_log', 'play_events']) {
    const res = await request.get(`${SUPABASE_URL}/rest/v1/${table}?select=*`, { headers: apiHeaders(token) });
    const rows = res.ok() ? ((await res.json()) as unknown[]).length : 0;
    expect(denied(res.status()) || rows === 0, `a normal user must not read ${table} (got ${res.status()}, ${rows} rows)`).toBeTruthy();
  }

  const promote = await request.patch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, {
    headers: apiHeaders(token),
    data: { role: 'admin' },
  });
  expect(promote.ok(), 'role change must be refused').toBeFalsy();
  const me = await request.get(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}&select=role`, { headers: apiHeaders(token) });
  expect(((await me.json()) as { role: string }[])[0].role).toBe('user');

  const adminView = await request.get(`${SUPABASE_URL}/rest/v1/v_admin_songs?select=*`, { headers: apiHeaders(token) });
  expect(adminView.ok() ? ((await adminView.json()) as unknown[]).length : 0, 'normal users get no rows from admin views').toBe(0);
});
