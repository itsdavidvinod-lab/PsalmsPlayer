// Stage mode: big lyrics for a setlist, with the key chosen for the service, and a screen that stays on.
import { randomUUID } from 'node:crypto';
import { expect, test } from '@playwright/test';
import { signUpAndIn, sql, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial' });

const SONG_ONE = 'd0000000-0000-0000-0000-000000000001'; // key G
const SINGLE = 'd0000000-0000-0000-0000-000000000004';
const SONG_TWO_HIDDEN = 'd0000000-0000-0000-0000-000000000002';

// A stand-in for the browser's wake lock, so the test can see that the page asks for it and asks again after being hidden.
const FAKE_WAKE_LOCK = `
window.__wakeLocks = 0; window.__wakeReleased = 0;
Object.defineProperty(navigator, 'wakeLock', { configurable: true, value: {
  request: async () => { window.__wakeLocks++; return { release: async () => { window.__wakeReleased++; } }; },
} });
`;

test('a setlist on stage: key for the service, moving through songs, text size, chords, screen on', async ({ page }) => {
  await page.addInitScript(FAKE_WAKE_LOCK);
  const email = uniqueEmail('stage');
  await signUpAndIn(page, email);
  const uid = sql(`select id from auth.users where email = '${email}'`);
  const list = randomUUID();
  sql(`insert into public.playlists (id, user_id, name, kind) values ('${list}', '${uid}', 'Stage test', 'setlist')`);
  sql(`insert into public.playlist_items (playlist_id, song_id, position, key_override) values
        ('${list}', '${SONG_ONE}', 1, 'A'), ('${list}', '${SINGLE}', 2, null), ('${list}', '${SONG_TWO_HIDDEN}', 3, null)`);

  await page.goto(`/stage/setlist/${list}`);
  await expect(page.getByRole('heading', { name: 'Placeholder Song One' })).toBeVisible();
  await expect(page.getByText('Song 1 of 3')).toBeVisible();
  await expect(page.getByRole('navigation')).toHaveCount(0); // no app frame on stage
  await expect(page.getByRole('region', { name: 'Player' })).toHaveCount(0);

  // The setlist chose key A for this song (it is in G): the chords follow.
  await expect(page.getByText(/· Key A$/)).toBeVisible();
  await expect(page.locator('.seg-chord').first()).toHaveText('A');

  // Text size grows and is remembered on this device.
  await expect(page.locator('.stage-lyrics')).toHaveAttribute('style', /--lyric-size:\s*2rem/);
  await page.getByRole('button', { name: 'Larger text' }).click();
  await expect(page.locator('.stage-lyrics')).toHaveAttribute('style', /--lyric-size:\s*2\.2rem/);
  await page.reload();
  await expect(page.locator('.stage-lyrics')).toHaveAttribute('style', /--lyric-size:\s*2\.2rem/);

  // A change made on stage, on top of the key chosen for the service.
  await page.getByRole('button', { name: 'Up one semitone' }).click();
  await expect(page.getByText(/· Key Bb$/)).toBeVisible();
  await expect(page.locator('.seg-chord').first()).toHaveText('Bb');

  await page.getByRole('button', { name: 'Hide chords' }).click();
  await expect(page.locator('.seg-chord')).toHaveCount(0);
  await page.getByRole('button', { name: 'Show chords' }).click();
  await expect(page.locator('.seg-chord').first()).toBeVisible();

  // The screen stays on, and the page asks again after it comes back from being hidden.
  await expect(page.getByRole('status').filter({ hasText: 'Screen stays on' })).toBeVisible();
  const before = await page.evaluate(() => (window as unknown as { __wakeLocks: number }).__wakeLocks);
  expect(before).toBeGreaterThanOrEqual(1);
  await page.evaluate(() => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
    document.dispatchEvent(new Event('visibilitychange'));
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __wakeLocks: number }).__wakeLocks)).toBeGreaterThan(before);

  // Next, with the keyboard and with the button; the unavailable slot keeps its place and shows no title.
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('heading', { name: 'Placeholder Single' })).toBeVisible();
  await expect(page.getByText('Song 2 of 3')).toBeVisible();
  await page.getByRole('button', { name: 'Next song' }).click();
  await expect(page.getByRole('heading', { name: 'Not available right now' })).toBeVisible();
  await expect(page.getByText('Song 3 of 3')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next song' })).toBeDisabled();
  const html = await page.content();
  expect(html).not.toContain('Placeholder Song Two');
  expect(html).not.toContain('Hidden placeholder line');

  // Back to the first song: the key change made on stage is still there.
  await page.getByRole('button', { name: 'Previous song' }).click();
  await page.getByRole('button', { name: 'Previous song' }).click();
  await expect(page.getByRole('heading', { name: 'Placeholder Song One' })).toBeVisible();
  await expect(page.getByText(/· Key Bb$/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Previous song' })).toBeDisabled();

  await page.getByRole('link', { name: 'Close Stage mode' }).click();
  await expect(page).toHaveURL(new RegExp(`/library/${list}$`));
});

test('one song on stage, from its page; hidden and unknown songs are not available', async ({ page }) => {
  await signUpAndIn(page, uniqueEmail('stage-one'));
  await page.goto('/song/placeholder-song-one');
  await expect(page.getByRole('link', { name: 'Stage mode' })).toHaveAttribute('href', '/stage/song/placeholder-song-one');
  await page.getByRole('link', { name: 'Stage mode' }).click();
  await expect(page).toHaveURL(/\/stage\/song\/placeholder-song-one$/);
  await expect(page.getByRole('heading', { name: 'Placeholder Song One' })).toBeVisible();
  await expect(page.getByText('Song 1 of 1')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Next song' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Previous song' })).toBeDisabled();
  await expect(page.getByText(/· Key G$/)).toBeVisible();

  await page.getByRole('link', { name: 'Close Stage mode' }).click();
  await expect(page).toHaveURL(/\/song\/placeholder-song-one$/);

  expect((await page.goto('/stage/song/placeholder-song-two'))?.status()).toBe(404);
  expect((await page.goto('/stage/song/no-such-song'))?.status()).toBe(404);
});
