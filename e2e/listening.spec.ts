// Runs after catalogue.spec.ts and before player.spec.ts and site.spec.ts (alphabetical). Uses real time: the server credits
// listening time only as fast as the clock moves, so this test has to wait. It plays a real (silent) audio file through the
// real player, so it also proves that a signed-in user can fetch a live song's file through the private bucket.
import { expect, test } from '@playwright/test';
import { SONG_ONE_ID, audioTime, ensureAudio, signUpAndIn, sql, uniqueEmail } from './helpers';

test('the player counts only the time the song is playing and audible', async ({ page, request }) => {
  test.setTimeout(150_000);
  await ensureAudio(request, SONG_ONE_ID);

  const email = uniqueEmail('player');
  await signUpAndIn(page, email);
  await page.goto('/song/placeholder-song-one');

  const mine = `(select id from auth.users where email = '${email}')`;
  const listened = () => sql(`select coalesce(sum(listened_s), 0) from public.listen_sessions where user_id = ${mine}`);

  // Opening the page is not listening: nothing is recorded until the song plays.
  await page.waitForTimeout(3_000);
  expect(sql(`select count(*) from public.listen_sessions where user_id = ${mine}`)).toBe('0');

  // Press play and listen for about 34 seconds.
  await page.getByRole('button', { name: 'Play Placeholder Song One' }).click();
  await expect.poll(() => audioTime(page), { message: 'the audio file really plays', timeout: 15_000 }).toBeGreaterThan(1);
  await page.waitForTimeout(34_000);

  // Mute: the next 20 seconds must not count, although the file keeps playing.
  await page.evaluate(() => { (document.querySelector('audio') as HTMLAudioElement).muted = true; });
  await page.waitForTimeout(3_000);
  const atMute = Number(listened());
  const timeAtMute = await audioTime(page);
  await page.waitForTimeout(20_000);
  expect(await audioTime(page), 'the file kept playing while muted').toBeGreaterThan(timeAtMute + 15);
  const afterMuted = Number(listened());

  expect(atMute, `about 34 s were heard before muting (recorded ${atMute})`).toBeGreaterThanOrEqual(26);
  expect(atMute).toBeLessThanOrEqual(40);
  expect(afterMuted - atMute, 'muted time is not counted').toBeLessThanOrEqual(2);
  expect(sql(`select bool_or(qualified_at is not null) from public.listen_sessions where user_id = ${mine}`)).toBe('t');

  // Pause: nothing more is counted, and the player says so.
  await page.evaluate(() => { (document.querySelector('audio') as HTMLAudioElement).muted = false; });
  await page.getByRole('region', { name: 'Player' }).getByRole('button', { name: 'Pause' }).click();
  await page.waitForTimeout(3_000);
  const paused = Number(listened());
  await page.waitForTimeout(8_000);
  expect(Number(listened()) - paused, 'paused time is not counted').toBeLessThanOrEqual(1);
});
