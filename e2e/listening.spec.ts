// Runs after catalogue.spec.ts and before site.spec.ts (alphabetical). Uses real time: the server credits listening time
// only as fast as the clock moves, so this test has to wait.
import { expect, test } from '@playwright/test';
import { signUpAndIn, sql, uniqueEmail } from './helpers';

// Stand-in for https://www.youtube.com/iframe_api, so the test can press play, mute and pause without a real video.
const FAKE_YOUTUBE_API = `
window.__yt = { players: [] };
window.YT = { Player: class {
  constructor(el, opts) {
    this.el = el; this.opts = opts; this.state = -1; this.muted = false; this.volume = 100;
    window.__yt.players.push(this);
    setTimeout(() => opts && opts.events && opts.events.onReady && opts.events.onReady({ target: this }), 0);
  }
  getPlayerState() { return this.state; }
  isMuted() { return this.muted; }
  getVolume() { return this.volume; }
  __set(state) { this.state = state; this.opts.events && this.opts.events.onStateChange && this.opts.events.onStateChange({ data: state, target: this }); }
} };
setTimeout(() => window.onYouTubeIframeAPIReady && window.onYouTubeIframeAPIReady(), 0);
`;

test('the song page counts only the time the video is playing and audible', async ({ page }) => {
  test.setTimeout(150_000);
  await page.route('**/iframe_api', (route) => route.fulfill({ contentType: 'application/javascript', body: FAKE_YOUTUBE_API }));

  const email = uniqueEmail('player');
  await signUpAndIn(page, email);
  await page.goto('/song/placeholder-song-one');
  await expect(page.locator('iframe[src*="enablejsapi=1"]')).toHaveCount(1);
  await page.waitForFunction(() => (window as any).__yt?.players.length === 1);

  const listened = () => sql(`select coalesce(sum(listened_s), 0) from public.listen_sessions where user_id = (select id from auth.users where email = '${email}')`);

  // Before anyone presses play, nothing is recorded.
  await page.waitForTimeout(3_000);
  expect(sql(`select count(*) from public.listen_sessions where user_id = (select id from auth.users where email = '${email}')`)).toBe('0');

  // Press play and listen for about 34 seconds.
  await page.evaluate(() => (window as any).__yt.players[0].__set(1));
  await page.waitForTimeout(34_000);

  // Mute: the next 20 seconds must not count.
  await page.evaluate(() => { (window as any).__yt.players[0].muted = true; });
  await page.waitForTimeout(3_000);
  const atMute = Number(listened());
  await page.waitForTimeout(20_000);
  await page.evaluate(() => (window as any).__yt.players[0].__set(2)); // pause
  await page.waitForTimeout(3_000);
  const afterMuted = Number(listened());

  expect(atMute, `about 34 s were heard before muting (recorded ${atMute})`).toBeGreaterThanOrEqual(26);
  expect(atMute).toBeLessThanOrEqual(38);
  expect(afterMuted - atMute, 'muted time is not counted').toBeLessThanOrEqual(2);
  expect(sql(`select bool_or(qualified_at is not null) from public.listen_sessions where user_id = (select id from auth.users where email = '${email}')`)).toBe('t');
});
