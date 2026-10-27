// The player layer: mini player across pages, queue, YouTube link-out, lyrics-only songs, and the private audio bucket
// as the real Storage service enforces it (the database tests only see a stand-in for Storage).
import { expect, test } from '@playwright/test';
import {
  ANON_KEY, SINGLE_ID, SONG_ONE_ID, SONG_TWO_ID, SUPABASE_URL, apiHeaders, audioTime, createApiUser, ensureAudio, signUpAndIn, sql, uniqueEmail,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test('a song with no audio file shows its lyrics and no play button', async ({ page }) => {
  await signUpAndIn(page, uniqueEmail('lyrics-only'));
  await expect(page.getByText('Placeholder Single', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Play Placeholder Single/ })).toHaveCount(0);
  await expect(page.locator('a[href="/song/placeholder-single"]').first()).toBeVisible();
  // The row still opens the lyrics, through the Lyrics icon.
  await expect(page.getByRole('link', { name: 'Lyrics of Placeholder Single' }).first()).toBeVisible();

  await page.goto('/song/placeholder-single');
  await expect(page.getByRole('heading', { name: 'Placeholder Single' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Listen' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Player' })).toHaveCount(0);
});

test('the mini player keeps playing across pages, Next moves down the list, and Pause pauses', async ({ page, request }) => {
  test.setTimeout(90_000);
  await ensureAudio(request, SONG_ONE_ID);
  await ensureAudio(request, SINGLE_ID);
  await signUpAndIn(page, uniqueEmail('queue'));

  await page.goto('/search?q=placeholder');
  const rows = page.locator('.song-row');
  await expect(rows).toHaveCount(2);
  await rows.first().getByRole('button', { name: /^Play / }).click();

  const mini = page.getByRole('region', { name: 'Player' });
  await expect(mini).toBeVisible();
  await expect.poll(() => audioTime(page), { timeout: 15_000 }).toBeGreaterThan(1);
  const firstTitle = (await mini.locator('.mini-title').innerText()).trim();

  // Moving to another page by the site's own links must not interrupt the music or reload the page.
  await page.evaluate(() => { (window as unknown as { __kept: number }).__kept = 1; });
  const before = await audioTime(page);
  await page.getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(mini).toBeVisible();
  await page.waitForTimeout(2_000);
  expect(await page.evaluate(() => (window as unknown as { __kept?: number }).__kept), 'no full page reload').toBe(1);
  expect(await audioTime(page), 'the song kept playing').toBeGreaterThan(before + 1);
  expect(await page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).paused)).toBe(false);

  // Tapping the song opens the player screen: the words and the controls, with no tab bar and no strip.
  await mini.locator('.mini-info').click();
  await expect(page).toHaveURL(/\/song\/placeholder-(single|song-one)$/);
  const dock = page.getByRole('region', { name: 'Listen' });
  await expect(dock).toBeVisible();
  await expect(page.getByRole('region', { name: 'Player' })).toHaveCount(0);
  await expect(dock.locator('.dock-title')).toHaveText(firstTitle);
  await expect(page.locator('.screen-source')).toBeVisible();

  // Next goes to the other song in the list, and the screen moves on to it.
  const srcBefore = await page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).src);
  await dock.getByRole('button', { name: 'Next' }).click();
  await expect(dock.locator('.dock-title')).not.toHaveText(firstTitle);
  await expect.poll(() => page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).src)).not.toBe(srcBefore);
  await expect.poll(() => audioTime(page), { timeout: 15_000 }).toBeGreaterThan(0.5);
  await expect(dock.getByRole('button', { name: 'Next' })).toBeDisabled(); // the end of a two-song queue
  expect(await page.evaluate(() => (window as unknown as { __kept?: number }).__kept), 'moving to the next song did not reload the page').toBe(1);

  await dock.getByRole('button', { name: /^Pause / }).click();
  await expect.poll(() => page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).paused)).toBe(true);
  await expect(dock.getByRole('button', { name: /^Play / })).toBeVisible();
});

test('shuffle and repeat are on the player screen and remembered; repeat one starts the song again; the Lyrics icon keeps the music going', async ({ page, request }) => {
  test.setTimeout(120_000);
  await ensureAudio(request, SONG_ONE_ID);
  await ensureAudio(request, SINGLE_ID);
  await signUpAndIn(page, uniqueEmail('modes'));
  await page.goto('/search?q=placeholder');
  await page.locator('.song-row').filter({ hasText: 'Placeholder Single' }).getByRole('button', { name: /^Play / }).click();
  await expect.poll(() => audioTime(page), { timeout: 15_000 }).toBeGreaterThan(1);

  // The Lyrics icon of another song opens its words only. The music keeps playing and the strip stays.
  await page.locator('.song-row').filter({ hasText: 'Placeholder Song One' }).getByRole('link', { name: 'Lyrics of Placeholder Song One' }).click();
  await expect(page).toHaveURL(/\/song\/placeholder-song-one\/lyrics$/);
  await expect(page.getByRole('heading', { name: 'Placeholder Song One' })).toBeVisible();
  await expect(page.getByText('Placeholder line one of the')).toBeVisible();
  await expect(page.getByText('Lyrics only · no audio file yet')).toHaveCount(0); // this song has audio
  const mini = page.getByRole('region', { name: 'Player' });
  await expect(mini).toBeVisible();
  await expect(mini.getByRole('button', { name: 'Pause' })).toBeVisible();
  expect(await page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).paused)).toBe(false);

  // Back to the song that is playing: the player screen.
  await mini.locator('.mini-info').click();
  await expect(page).toHaveURL(/\/song\/placeholder-single$/);
  const dock = page.getByRole('region', { name: 'Listen' });
  const shuffle = dock.getByRole('button', { name: 'Shuffle' });
  await expect(shuffle).toHaveAttribute('aria-pressed', 'false');
  await shuffle.click();
  await expect(shuffle).toHaveAttribute('aria-pressed', 'true');
  expect(await page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).paused), 'turning shuffle on does not stop the song').toBe(false);

  // Repeat: off, then all, then one.
  await dock.getByRole('button', { name: 'Repeat off' }).click();
  await expect(dock.getByRole('button', { name: 'Repeat all' })).toHaveAttribute('aria-pressed', 'true');
  await dock.getByRole('button', { name: 'Repeat all' }).click();
  await expect(dock.getByRole('button', { name: 'Repeat one' })).toHaveAttribute('aria-pressed', 'true');

  // Both choices are remembered on this device.
  await page.reload();
  await expect(page.getByRole('region', { name: 'Listen' }).getByRole('button', { name: 'Shuffle' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('region', { name: 'Listen' }).getByRole('button', { name: 'Repeat one' })).toBeVisible();

  // Repeat one: near the end of the song it starts again instead of stopping. The queue here is this song alone.
  await page.getByRole('button', { name: 'Play Placeholder Single' }).click();
  await expect.poll(() => audioTime(page), { timeout: 15_000 }).toBeGreaterThan(1);
  await page.evaluate(() => {
    const a = document.querySelector('audio') as HTMLAudioElement;
    a.currentTime = a.duration - 2;
  });
  await expect.poll(() => audioTime(page), { timeout: 20_000 }).toBeLessThan(5);
  expect(await page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).paused), 'repeat one keeps playing').toBe(false);

  // Repeat off: at the end of the last song it stops.
  await page.getByRole('region', { name: 'Listen' }).getByRole('button', { name: 'Repeat one' }).click();
  await expect(page.getByRole('region', { name: 'Listen' }).getByRole('button', { name: 'Repeat off' })).toBeVisible();
  await page.evaluate(() => {
    const a = document.querySelector('audio') as HTMLAudioElement;
    a.currentTime = a.duration - 2;
  });
  await expect.poll(() => page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).paused), { timeout: 20_000 }).toBe(true);
  await expect(page.getByRole('button', { name: 'Play Placeholder Single' })).toBeVisible();
});

test('on a phone the tab bar shows on the lists, goes away on the full-screen song, and the strip stays on the lyrics page', async ({ page, request }) => {
  test.setTimeout(90_000);
  await ensureAudio(request, SONG_ONE_ID);
  await page.setViewportSize({ width: 390, height: 800 });
  await signUpAndIn(page, uniqueEmail('phone'));
  await expect(page.locator('.tabbar')).toBeVisible();
  await expect(page.locator('.side')).toBeHidden();

  await page.goto('/song/placeholder-song-one');
  await expect(page.getByRole('region', { name: 'Listen' })).toBeVisible();
  await expect(page.locator('.tabbar')).toBeHidden();
  await page.getByRole('button', { name: 'Play Placeholder Song One' }).click();
  await expect.poll(() => audioTime(page), { timeout: 15_000 }).toBeGreaterThan(1);
  await expect(page.getByRole('region', { name: 'Player' })).toHaveCount(0); // the player screen has its own controls

  // Leave through the artist link: the lists come back with the tab bar and the strip.
  await page.getByRole('region', { name: 'Listen' }).getByRole('link', { name: 'Grace Worship Team' }).click();
  await expect(page).toHaveURL(/\/artist\/grace-worship$/);
  await expect(page.locator('.tabbar')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Player' })).toBeVisible();

  // The Lyrics icon: no tab bar, but the strip stays and the music goes on.
  await page.locator('.song-row').filter({ hasText: 'Placeholder Song One' }).getByRole('link', { name: 'Lyrics of Placeholder Song One' }).click();
  await expect(page).toHaveURL(/\/song\/placeholder-song-one\/lyrics$/);
  await expect(page.locator('.tabbar')).toBeHidden();
  await expect(page.getByRole('region', { name: 'Player' })).toBeVisible();
  expect(await page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).paused)).toBe(false);
});

test('the YouTube link opens YouTube in a new tab, pauses our audio, and loads nothing from YouTube into the page', async ({ page, context, request }) => {
  test.setTimeout(60_000);
  await ensureAudio(request, SONG_ONE_ID);
  await context.route('https://www.youtube.com/**', (route) => route.fulfill({ contentType: 'text/html', body: '<html><body>youtube stub</body></html>' }));
  await signUpAndIn(page, uniqueEmail('youtube'));

  await page.goto('/song/placeholder-song-one');
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByRole('button', { name: 'Play Placeholder Song One' }).click();
  await expect.poll(() => audioTime(page), { timeout: 15_000 }).toBeGreaterThan(1);

  // On another page the strip carries the same link while this song is loaded.
  await page.getByRole('region', { name: 'Listen' }).getByRole('link', { name: 'Grace Worship Team' }).click();
  await expect(page).toHaveURL(/\/artist\/grace-worship$/);
  const mini = page.getByRole('region', { name: 'Player' });
  await expect(mini.getByRole('link', { name: 'Watch on YouTube' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

  // The song's own ⋮ menu has it too, as a link that opens a new tab.
  await mini.locator('.mini-info').click();
  await expect(page).toHaveURL(/\/song\/placeholder-song-one$/);
  await page.getByRole('button', { name: 'More options for Placeholder Song One' }).click();
  const link = page.getByRole('dialog').getByRole('link', { name: 'Watch on YouTube' });
  await expect(link).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await expect(link).toHaveAttribute('target', '_blank');
  await expect(link).toHaveAttribute('rel', /noopener/);

  const [opened] = await Promise.all([context.waitForEvent('page'), link.click()]);
  await opened.waitForLoadState();
  expect(opened.url()).toBe('https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await opened.close();
  expect(await page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).paused), 'our audio stops when YouTube opens').toBe(true);
});

test('the audio bucket is private: links are issued only for live songs, to signed-in users', async ({ request }) => {
  const pathOne = await ensureAudio(request, SONG_ONE_ID);
  const pathTwo = await ensureAudio(request, SONG_TWO_ID); // song two is hidden (its artist's agreement is incomplete)
  const user = await createApiUser(request, 'bucket');
  const sign = (path: string, token?: string) =>
    request.post(`${SUPABASE_URL}/storage/v1/object/sign/audio/${path}`, { headers: apiHeaders(token), data: { expiresIn: 60 } });

  // Anonymous callers: no signed link, no direct or public read.
  expect((await sign(pathOne)).ok(), 'anonymous must not get a signed link').toBeFalsy();
  expect((await request.get(`${SUPABASE_URL}/storage/v1/object/public/audio/${pathOne}`)).ok(), 'the bucket is not public').toBeFalsy();
  expect((await request.get(`${SUPABASE_URL}/storage/v1/object/audio/${pathOne}`, { headers: { apikey: ANON_KEY } })).ok()).toBeFalsy();

  // A signed-in user gets a working link for a live song and none for a hidden song's file.
  const live = await sign(pathOne, user.token);
  expect(live.ok(), `a user should get a link for a live song (${live.status()})`).toBeTruthy();
  const { signedURL } = (await live.json()) as { signedURL: string };
  const file = await request.get(`${SUPABASE_URL}/storage/v1${signedURL}`);
  expect(file.ok()).toBeTruthy();
  expect(file.headers()['content-type']).toContain('audio');
  expect((await file.body()).length).toBeGreaterThan(100_000);

  const hidden = await sign(pathTwo, user.token);
  expect(hidden.ok(), 'no link for a hidden song').toBeFalsy();
  const rpc = await request.post(`${SUPABASE_URL}/rest/v1/rpc/song_audio_path`, { headers: apiHeaders(user.token), data: { p_song: SONG_TWO_ID } });
  expect(await rpc.text()).toBe('null');
  const rpcLive = await request.post(`${SUPABASE_URL}/rest/v1/rpc/song_audio_path`, { headers: apiHeaders(user.token), data: { p_song: SONG_ONE_ID } });
  expect(await rpcLive.json()).toBe(pathOne);

  // A normal user cannot upload or replace files.
  const upload = await request.post(`${SUPABASE_URL}/storage/v1/object/audio/${SONG_ONE_ID}/intruder.wav`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${user.token}`, 'Content-Type': 'audio/wav' },
    data: Buffer.alloc(2000, 0x80),
  });
  expect(upload.ok(), 'only admins may upload').toBeFalsy();
});

test('without the artist\'s audio right the song is lyrics-only and its file is not served', async ({ page, request }) => {
  const path = await ensureAudio(request, SONG_ONE_ID);
  const user = await createApiUser(request, 'rights');
  const agreement = 'b0000000-0000-0000-0000-000000000001'; // Grace Worship Team's agreement in the seed data
  sql(`update public.agreements set allow_audio_hosting = false where id = '${agreement}'`);
  try {
    const rpc = await request.post(`${SUPABASE_URL}/rest/v1/rpc/song_audio_path`, { headers: apiHeaders(user.token), data: { p_song: SONG_ONE_ID } });
    expect(await rpc.text(), 'no path without the audio right').toBe('null');
    const sign = await request.post(`${SUPABASE_URL}/storage/v1/object/sign/audio/${path}`, { headers: apiHeaders(user.token), data: { expiresIn: 60 } });
    expect(sign.ok(), 'no signed link without the audio right').toBeFalsy();

    await signUpAndIn(page, uniqueEmail('rights'));
    await page.goto('/song/placeholder-song-one');
    await expect(page.getByRole('heading', { name: 'Placeholder Song One' })).toBeVisible();
    await expect(page.getByText('Placeholder line one of the')).toBeVisible();
    await expect(page.getByRole('button', { name: /^Play / })).toHaveCount(0);
    await expect(page.getByText('Lyrics only · no audio file yet')).toBeVisible();
  } finally {
    sql(`update public.agreements set allow_audio_hosting = true where id = '${agreement}'`);
  }
  const back = await request.post(`${SUPABASE_URL}/rest/v1/rpc/song_audio_path`, { headers: apiHeaders(user.token), data: { p_song: SONG_ONE_ID } });
  expect(await back.json(), 'the path returns with the right').toBe(path);
});
