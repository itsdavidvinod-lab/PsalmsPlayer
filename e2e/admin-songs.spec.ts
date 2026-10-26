// Admin songs: the lifecycle of a song (what makes it live or hidden), lyrics, the YouTube link and the album choice.
// Runs on the real Supabase stack. Everything created here is deleted at the end so later specs see only the seed data.
import { expect, test } from '@playwright/test';
import { GRACE_ID, SHALOM_ID, signInAsAdmin, sql } from './helpers';

test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  sql(`delete from public.songs where slug like 'e2e-song-%'`);
});

/** A bare song straight in the database, for tests that are about something other than creating one. */
function bareSong(slug: string): string {
  return sql(`insert into public.songs (artist_id, slug, title, language_code) values ('${GRACE_ID}', '${slug}', 'E2E bare song', 'ta') returning id`).split('\n')[0];
}

test('a new song goes live only when every rule is met, and the page says what is missing at each step', async ({ page }) => {
  const { userId } = await signInAsAdmin(page);
  const slug = `e2e-song-${Date.now()}`;

  await page.goto(`/admin/songs/new?artist=${GRACE_ID}`);
  await expect(page.locator('#song-artist')).toHaveValue(GRACE_ID);
  await page.locator('#song-title').fill('E2E Song');
  await expect(page.locator('#song-slug')).toHaveValue('e2e-song'); // suggested from the title
  await page.locator('#song-slug').fill(slug);
  await page.locator('#song-language').selectOption('ta');
  await page.locator('#song-key').selectOption('Am');
  await page.locator('#song-tempo').fill('72');
  await page.getByRole('button', { name: 'Create song' }).click();
  await expect(page).toHaveURL(/\/admin\/songs\/[0-9a-f-]{36}$/);
  await expect(page.getByRole('heading', { name: 'E2E Song', level: 1 })).toBeVisible();

  const id = sql(`select id from public.songs where slug = '${slug}'`);
  expect(sql(`select musical_key || '|' || tempo_bpm || '|' || language_code || '|' || is_published from public.songs where id = '${id}'`)).toBe('Am|72|ta|false');
  expect(sql(`select count(*) from public.audit_log where entity = 'songs' and entity_id = '${id}' and action = 'INSERT' and actor = '${userId}'`)).toBe('1');

  const box = page.getByRole('status', { name: 'Song status' });
  const live = () => sql(`select count(*) from public.v_songs where slug = '${slug}'`);
  await expect(box).toContainText('Not live: Not published yet');
  await expect(box).toContainText('Tick "Published"');

  // 1. publish
  await page.locator('#song-published').check();
  await page.getByRole('button', { name: 'Save song' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  await expect(box).toContainText('Not live: No writer credited');
  expect(sql(`select published_at is not null from public.songs where id = '${id}'`)).toBe('t');

  // 2. a writer, consent still pending
  await page.getByText('Add a credit').click();
  await page.locator('#credit-new-person').fill('E2E Writer');
  await page.getByRole('button', { name: 'Add credit' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Credit added.' })).toBeVisible();
  await expect(box).toContainText('Not live: A writer or owner has not given consent');
  expect(live()).toBe('0');

  // 3. consent granted: the song is live for users
  const credit = page.locator('details', { hasText: 'E2E Writer' });
  await credit.locator('summary').click();
  await credit.getByLabel('Consent', { exact: true }).selectOption('granted');
  await credit.getByRole('button', { name: 'Save credit' }).click();
  await expect(box).toContainText('Live: users can find this song.');
  expect(live()).toBe('1');

  // 4. the consent runs out: hidden again, with no other step
  await credit.getByLabel('Consent valid through (optional)').fill('2000-01-01');
  await credit.getByRole('button', { name: 'Save credit' }).click();
  await expect(box).toContainText('Not live: A consent has expired');
  expect(live()).toBe('0');
  await credit.getByLabel('Consent valid through (optional)').fill('');
  await credit.getByRole('button', { name: 'Save credit' }).click();
  await expect(box).toContainText('Live: users can find this song.');
  expect(live()).toBe('1');

  // 5. a takedown beats everything
  await page.locator('#song-hidden').check();
  await page.locator('#song-hidden-note').fill('e2e takedown');
  await page.getByRole('button', { name: 'Save song' }).click();
  await expect(box).toContainText('Not live: Taken down by an admin');
  expect(live()).toBe('0');
  await page.locator('#song-hidden').uncheck();
  await page.getByRole('button', { name: 'Save song' }).click();
  await expect(box).toContainText('Live: users can find this song.');
  expect(sql(`select hidden_by_admin || '|' || coalesce(hidden_note, '-') from public.songs where id = '${id}'`)).toBe('false|-');

  // Every step was recorded with the admin's name.
  expect(Number(sql(`select count(*) from public.audit_log where entity = 'song_credits' and actor = '${userId}'`))).toBeGreaterThanOrEqual(3);
  expect(Number(sql(`select count(*) from public.audit_log where entity = 'songs' and entity_id = '${id}' and action = 'UPDATE' and actor = '${userId}'`))).toBeGreaterThanOrEqual(3);

  // The dashboard lists a hidden song with its reason.
  await page.locator('#song-hidden').check();
  await page.getByRole('button', { name: 'Save song' }).click();
  await expect(box).toContainText('Taken down');
  await page.goto('/admin');
  await expect(page.getByRole('link', { name: /E2E Song/ })).toContainText('Taken down by an admin');
});

test('lyrics: warnings never block, the preview shows chords, three versions save and one can be removed', async ({ page }) => {
  await signInAsAdmin(page);
  const id = bareSong(`e2e-song-lyrics-${Date.now()}`);
  await page.goto(`/admin/songs/${id}`);

  await page.locator('#lyrics-body').fill('{comment: Verse 1}\n[G]Hello [C]world\n\n[Hm]typo');
  const warnings = page.getByLabel('Warnings');
  await expect(warnings).toContainText('Line 4');
  await expect(warnings).toContainText('"Hm" does not look like a chord');
  await expect(page.locator('.lyrics .seg-chord').first()).toHaveText('G');
  await expect(page.locator('.lyrics')).toContainText('Hello');
  await expect(page.locator('.lyrics')).toContainText('Verse 1');

  await page.getByLabel('Show chords').uncheck();
  await expect(page.locator('.lyrics .seg-chord')).toHaveCount(0);
  await page.getByLabel('Show chords').check();

  // The warning does not stop saving.
  await page.getByRole('button', { name: 'Save original lyrics' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Original lyrics saved.' })).toBeVisible();
  expect(sql(`select count(*) from public.lyrics where song_id = '${id}' and version = 'original' and language_code = 'ta' and body like '%[G]Hello [C]world%'`)).toBe('1');
  await page.reload();
  await expect(page.locator('#lyrics-body')).toHaveValue(/\[G\]Hello \[C\]world/);

  // A second version, then remove it. Saving the first version again changes the row, not the count.
  await page.getByRole('button', { name: /^Romanized/ }).click();
  await expect(page.locator('#lyrics-body')).toHaveValue('');
  await page.locator('#lyrics-body').fill('[G]Vanakkam');
  await page.getByRole('button', { name: 'Save romanized lyrics' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Romanized lyrics saved.' })).toBeVisible();
  expect(sql(`select count(*) from public.lyrics where song_id = '${id}'`)).toBe('2');
  await page.locator('#lyrics-body').fill('[G]Vanakkam again');
  await page.getByRole('button', { name: 'Save romanized lyrics' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Romanized lyrics saved.' })).toBeVisible();
  expect(sql(`select count(*) from public.lyrics where song_id = '${id}'`)).toBe('2');
  expect(sql(`select body from public.lyrics where song_id = '${id}' and version = 'romanized'`)).toBe('[G]Vanakkam again');

  await page.getByRole('button', { name: 'Remove this version' }).click();
  await page.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Romanized lyrics removed.' })).toBeVisible();
  expect(sql(`select count(*) from public.lyrics where song_id = '${id}'`)).toBe('1');

  // An empty version cannot be saved.
  await page.getByRole('button', { name: /^Meaning/ }).click();
  await page.getByRole('button', { name: 'Save meaning lyrics' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Write the lyrics first' })).toBeVisible();
});

test('YouTube link: any form of address is read, a new link starts unchecked, and users get it only once it is checked', async ({ page }) => {
  await signInAsAdmin(page);
  const slug = `e2e-song-yt-${Date.now()}`;
  const id = bareSong(slug);
  await page.goto(`/admin/songs/${id}`);

  await page.locator('#yt-link').fill('not a link');
  await page.getByRole('button', { name: 'Save link' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'not a YouTube link' })).toBeVisible();
  expect(sql(`select coalesce(youtube_id, '-') from public.songs where id = '${id}'`)).toBe('-');

  await page.locator('#yt-link').fill('https://youtu.be/dQw4w9WgXcQ?si=abc');
  await page.getByRole('button', { name: 'Save link' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Link saved' })).toBeVisible();
  expect(sql(`select youtube_id || '|' || youtube_status from public.songs where id = '${id}'`)).toBe('dQw4w9WgXcQ|unchecked');
  await expect(page.getByRole('link', { name: 'Open on YouTube to check' })).toHaveAttribute('href', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ');
  await expect(page.locator('#yt-link')).toHaveValue('https://www.youtube.com/watch?v=dQw4w9WgXcQ');

  // Make the song live so the user-facing view can be checked: the link appears only when the result is OK.
  sql(`update public.songs set is_published = true where id = '${id}'`);
  sql(`insert into public.song_credits (song_id, person_name, role, consent_status, consent_ref) values ('${id}', 'E2E Writer', 'writer', 'granted', 'e2e')`);
  expect(sql(`select count(*) from public.v_songs where slug = '${slug}'`)).toBe('1');
  expect(sql(`select coalesce(youtube_id, '-') from public.v_songs where slug = '${slug}'`)).toBe('-');

  await page.reload();
  await page.locator('#yt-status').selectOption('ok');
  await page.getByRole('button', { name: 'Save result' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Status saved.' })).toBeVisible();
  expect(sql(`select youtube_status || '|' || (youtube_checked_at is not null) from public.songs where id = '${id}'`)).toBe('ok|true');
  expect(sql(`select youtube_id from public.v_songs where slug = '${slug}'`)).toBe('dQw4w9WgXcQ');

  await page.locator('#yt-status').selectOption('channel_mismatch');
  await page.getByRole('button', { name: 'Save result' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Status saved.' })).toBeVisible();
  expect(sql(`select coalesce(youtube_id, '-') from public.v_songs where slug = '${slug}'`)).toBe('-');

  // Changing the link resets the check; removing it clears everything.
  await page.locator('#yt-link').fill('https://www.youtube.com/watch?v=9bZkp7q19f0');
  await page.getByRole('button', { name: 'Save link' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Link saved' })).toBeVisible();
  expect(sql(`select youtube_id || '|' || youtube_status from public.songs where id = '${id}'`)).toBe('9bZkp7q19f0|unchecked');
  await page.locator('#yt-link').fill('');
  await page.getByRole('button', { name: 'Save link' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Link removed.' })).toBeVisible();
  expect(sql(`select coalesce(youtube_id, '-') || '|' || youtube_status from public.songs where id = '${id}'`)).toBe('-|unchecked');
});

test('the album choice follows the artist, the song list can be searched, and the database refuses a mismatch', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin/songs/new');
  await page.locator('#song-artist').selectOption(GRACE_ID);
  await expect(page.locator('#song-album option')).toHaveText(['No album (single)', 'Morning Light']);
  await page.locator('#song-artist').selectOption(SHALOM_ID);
  await expect(page.locator('#song-album option')).toHaveText(['No album (single)', 'Evening Hymns']);

  // Missing language is caught before anything is saved.
  await page.locator('#song-title').fill('E2E No Language');
  await page.locator('#song-slug').fill(`e2e-song-nolang-${Date.now()}`);
  await page.getByRole('button', { name: 'Create song' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Choose the language' })).toBeVisible();
  expect(sql(`select count(*) from public.songs where title = 'E2E No Language'`)).toBe('0');

  // A taken address comes back as a plain message.
  await page.locator('#song-language').selectOption('ml');
  await page.locator('#song-slug').fill('placeholder-song-one');
  await page.getByRole('button', { name: 'Create song' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'already uses' })).toBeVisible();

  // The list: search and the live / not-live filter.
  await page.goto('/admin/songs');
  await expect(page.getByRole('link', { name: /Placeholder Song One/ })).toBeVisible();
  await page.locator('#song-search').fill('single');
  await expect(page.getByRole('link', { name: /Placeholder Single/ })).toBeVisible();
  await expect(page.getByRole('link', { name: /Placeholder Song One/ })).toHaveCount(0);
  await page.locator('#song-search').fill('');
  await page.locator('#song-show').selectOption('hidden');
  await expect(page.getByRole('link', { name: /Placeholder Song One/ })).toHaveCount(0);
  await expect(page.getByRole('link', { name: /Placeholder Song Two/ })).toContainText('A writer or owner has not given consent');
});
