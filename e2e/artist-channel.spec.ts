// An artist's YouTube channel: the admin sets it on the artist form (and only a real YouTube channel address is kept), and the artist page
// shows a Subscribe link beside Follow, on that page only. Runs on the real Supabase stack.
import { expect, test } from '@playwright/test';
import { GRACE_ID, SHALOM_ID, signInAsAdmin, signUpAndIn, sql, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial' });

const CHANNEL = 'https://www.youtube.com/@graceworship';

test.afterAll(() => {
  sql(`update public.artists set youtube_channel_url = null where id in ('${GRACE_ID}', '${SHALOM_ID}')`);
  sql(`delete from public.artists where slug like 'e2e-artist-channel-%'`);
});

test('the artist page shows Subscribe beside Follow, opening the channel in a new tab and asking YouTube to confirm', async ({ page }) => {
  sql(`update public.artists set youtube_channel_url = '${CHANNEL}' where id = '${GRACE_ID}'`);
  await signUpAndIn(page, uniqueEmail('channel'));
  await page.goto('/artist/grace-worship');

  const subscribe = page.getByRole('link', { name: 'Subscribe to Grace Worship Team on YouTube' });
  await expect(subscribe).toBeVisible();
  await expect(subscribe).toHaveAttribute('href', `${CHANNEL}?sub_confirmation=1`);
  await expect(subscribe).toHaveAttribute('target', '_blank');
  await expect(subscribe).toHaveAttribute('rel', /noopener/);
  await expect(subscribe).toContainText('Subscribe');

  // Beside the Follow button, in the same row of actions.
  const actions = page.locator('.artist-actions');
  await expect(actions.getByRole('button', { name: 'Follow', exact: true })).toBeVisible();
  await expect(actions.getByRole('link', { name: /Subscribe to/ })).toBeVisible();

  // Following still works with the link there.
  await actions.getByRole('button', { name: 'Follow', exact: true }).click();
  await expect(actions.getByRole('button', { name: 'Following', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(actions.getByRole('link', { name: /Subscribe to/ })).toBeVisible();
});

test('the Subscribe link is on the artist page only', async ({ page }) => {
  sql(`update public.artists set youtube_channel_url = '${CHANNEL}' where id = '${GRACE_ID}'`);
  await signUpAndIn(page, uniqueEmail('channel-elsewhere'));
  await page.goto('/search?q=grace');
  await expect(page.locator('a[href="/artist/grace-worship"]').first()).toBeVisible(); // the artist is listed here, without the link
  await expect(page.getByRole('link', { name: /Subscribe to/ })).toHaveCount(0);
  for (const path of ['/', '/search?q=placeholder%20song%20one', '/library']) {
    await page.goto(path);
    await expect(page.getByRole('link', { name: /Subscribe to/ }), path).toHaveCount(0);
  }
  // The song's own page (which names the artist) has none either.
  await page.goto('/search?q=placeholder%20song%20one');
  await page.locator('.song-main').first().click();
  await expect(page).toHaveURL(/\/song\//);
  await expect(page.getByRole('link', { name: /Subscribe to/ })).toHaveCount(0);
});

test('with no channel set there is no Subscribe link', async ({ page }) => {
  sql(`update public.artists set youtube_channel_url = null where id = '${GRACE_ID}'`);
  await signUpAndIn(page, uniqueEmail('channel-none'));
  await page.goto('/artist/grace-worship');
  await expect(page.getByRole('button', { name: 'Follow', exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Subscribe to/ })).toHaveCount(0);
});

test('an artist who is not available shows no channel, even when one is set', async ({ page }) => {
  // The seed artist whose agreement has expired: the page says so and holds back the photo, bio and the rest.
  sql(`update public.artists set youtube_channel_url = 'https://www.youtube.com/@shalomchoir' where id = '${SHALOM_ID}'`);
  await signUpAndIn(page, uniqueEmail('channel-unavailable'));
  await page.goto('/artist/shalom-choir');
  await expect(page.getByRole('heading', { name: 'Shalom Choir', level: 1 })).toBeVisible();
  await expect(page.getByText('Unavailable', { exact: true })).toBeVisible();
  await expect(page.getByRole('link', { name: /Subscribe to/ })).toHaveCount(0);
  expect(await page.content()).not.toContain('shalomchoir');
});

test('the admin sets the channel on the artist form: any way of copying the address is cleaned, and only YouTube channels are kept', async ({ page }) => {
  await signInAsAdmin(page);
  const slug = `e2e-artist-channel-${Date.now()}`;
  sql(`insert into public.artists (slug, name) values ('${slug}', 'E2E Channel Artist')`);
  const id = sql(`select id from public.artists where slug = '${slug}'`);
  const saved = () => sql(`select coalesce(youtube_channel_url, '') from public.artists where id = '${id}'`);

  await page.goto(`/admin/artists/${id}`);
  const field = page.locator('#artist-channel');
  await expect(field).toBeVisible();
  await expect(field).toHaveValue('');

  // A pasted address with a page and tracking on the end is cut down to the channel.
  await field.fill('youtube.com/@e2echannel/videos?si=abc123');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  expect(saved()).toBe('https://www.youtube.com/@e2echannel');

  // Only the handle is enough, and /channel/ and /c/ addresses are accepted.
  await field.fill('@handleonly');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  expect(saved()).toBe('https://www.youtube.com/@handleonly');
  await field.fill('https://m.youtube.com/channel/UCabc123XYZ');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  expect(saved()).toBe('https://www.youtube.com/channel/UCabc123XYZ');

  // Another website, or a video rather than a channel, is refused with a sentence, and nothing changes.
  for (const bad of ['https://example.com/@someone', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'not an address']) {
    await field.fill(bad);
    await page.getByRole('button', { name: 'Save changes' }).click();
    await expect(page.getByRole('alert').filter({ hasText: 'That is not a YouTube channel address.' }), bad).toBeVisible();
    expect(saved(), bad).toBe('https://www.youtube.com/channel/UCabc123XYZ');
  }

  // Emptying the field removes the channel.
  await field.fill('');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  expect(saved()).toBe('');
});

test('the database refuses a channel that is not on youtube.com, whatever sends it', async () => {
  for (const bad of ['http://www.youtube.com/@x', 'https://youtube.com.evil.example/@x', 'https://www.youtube.com/watch?v=abc', 'javascript:alert(1)']) {
    expect(() => sql(`update public.artists set youtube_channel_url = '${bad.replace(/'/g, "''")}' where id = '${GRACE_ID}'`), bad).toThrow();
  }
  expect(sql(`select coalesce(youtube_channel_url, '') from public.artists where id = '${GRACE_ID}'`)).toBe('');
});
