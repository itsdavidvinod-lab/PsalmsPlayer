// The player layer: mini player across pages, queue, YouTube link-out, lyrics-only songs, and the private audio bucket
// as the real Storage service enforces it (the database tests only see a stand-in for Storage).
import { expect, test } from '@playwright/test';
import {
  ANON_KEY, SINGLE_ID, SONG_ONE_ID, SONG_TWO_ID, SUPABASE_URL, apiHeaders, audioTime, createApiUser, ensureAudio, signUpAndIn, uniqueEmail,
} from './helpers';

test.describe.configure({ mode: 'serial' });

test('a song with no audio file shows its lyrics and no play button', async ({ page }) => {
  await signUpAndIn(page, uniqueEmail('lyrics-only'));
  await expect(page.getByText('Placeholder Single', { exact: true }).first()).toBeVisible();
  await expect(page.getByRole('button', { name: /^Play Placeholder Single/ })).toHaveCount(0);
  await expect(page.locator('a[href="/song/placeholder-single"]').first()).toBeVisible();
  await expect(page.getByText('Lyrics', { exact: true }).first()).toBeVisible();

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

  await page.goto('/browse?q=placeholder');
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
  await page.getByRole('navigation', { name: 'Main' }).first().getByRole('link', { name: 'Settings' }).click();
  await expect(page).toHaveURL(/\/settings$/);
  await expect(mini).toBeVisible();
  await page.waitForTimeout(2_000);
  expect(await page.evaluate(() => (window as unknown as { __kept?: number }).__kept), 'no full page reload').toBe(1);
  expect(await audioTime(page), 'the song kept playing').toBeGreaterThan(before + 1);
  expect(await page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).paused)).toBe(false);

  // Tapping the song opens its page, with the lyrics.
  await mini.locator('.mini-info').click();
  await expect(page).toHaveURL(/\/song\/placeholder-(single|song-one)$/);
  await expect(page.getByRole('region', { name: 'Listen' })).toBeVisible();

  // Next goes to the other song in the list.
  const srcBefore = await page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).src);
  await mini.getByRole('button', { name: 'Next' }).click();
  await expect(mini.locator('.mini-title')).not.toHaveText(firstTitle);
  await expect.poll(() => page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).src)).not.toBe(srcBefore);
  await expect.poll(() => audioTime(page), { timeout: 15_000 }).toBeGreaterThan(0.5);
  await expect(mini.getByRole('button', { name: 'Next' })).toBeDisabled(); // the end of a two-song queue

  await mini.getByRole('button', { name: 'Pause' }).click();
  await expect.poll(() => page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).paused)).toBe(true);
  await expect(mini.getByRole('button', { name: 'Play' })).toBeVisible();
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

  // The mini player carries the same link while this song is loaded.
  await expect(page.getByRole('region', { name: 'Player' }).getByRole('link', { name: 'Watch on YouTube' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');

  const link = page.getByRole('region', { name: 'Listen' }).getByRole('link', { name: 'Watch on YouTube' });
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
