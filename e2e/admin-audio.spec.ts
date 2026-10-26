// Admin audio: upload, preview, replace and remove a song's recording, and what the page says about whether users can play it.
// Runs on the real Supabase stack. Songs made here are deleted at the end; every file is removed through the page itself
// (the storage tables refuse direct deletes, which is what we want from them).
import { expect, test } from '@playwright/test';
import { GRACE_ID, SHALOM_ID, signInAsAdmin, silentMp3, sql } from './helpers';

test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  sql(`delete from public.songs where slug like 'e2e-song-%'`);
});

function bareSong(artistId: string, slug: string): string {
  return sql(`insert into public.songs (artist_id, slug, title, language_code) values ('${artistId}', '${slug}', 'E2E audio song', 'ta') returning id`).split('\n')[0];
}
const audioRow = (id: string) =>
  sql(`select coalesce(audio_path, '') || '|' || coalesce(audio_mime, '') || '|' || coalesce(audio_bytes::text, '') || '|' || coalesce(duration_s::text, '') from public.songs where id = '${id}'`).split('|');
const objects = (path: string) => sql(`select count(*) from storage.objects where bucket_id = 'audio' and name = '${path}'`);

test('upload, preview, replace and remove a recording; wrong files are refused before anything is sent', async ({ page }) => {
  const id = bareSong(GRACE_ID, `e2e-song-audio-${Date.now()}`);
  await signInAsAdmin(page);
  await page.goto(`/admin/songs/${id}`);
  const section = page.locator('section[aria-labelledby="recording"]');
  const file = section.locator('#audio-file');
  await expect(section).toContainText('No recording yet');

  // Refused in the browser: wrong format, a name that lies about its content, nothing chosen.
  await section.getByRole('button', { name: 'Upload file' }).click();
  await expect(section.getByRole('alert').filter({ hasText: 'Choose an MP3 or M4A file first.' })).toBeVisible();
  await file.setInputFiles({ name: 'tone.wav', mimeType: 'audio/wav', buffer: Buffer.alloc(100) });
  await section.getByRole('button', { name: 'Upload file' }).click();
  await expect(section.getByRole('alert').filter({ hasText: 'Only MP3 and M4A/AAC files are accepted.' })).toBeVisible();
  await file.setInputFiles({ name: 'fake.mp3', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await section.getByRole('button', { name: 'Upload file' }).click();
  await expect(section.getByRole('alert').filter({ hasText: 'does not match' })).toBeVisible();
  expect(audioRow(id)).toEqual(['', '', '', '']);

  // A real upload.
  const first = silentMp3(100);
  await file.setInputFiles({ name: 'E2E Tone One.mp3', mimeType: 'audio/mpeg', buffer: first });
  await section.getByRole('button', { name: 'Upload file' }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Uploaded.' })).toBeVisible();
  const [path1, mime1, bytes1, seconds1] = audioRow(id);
  expect(path1).toMatch(new RegExp(`^${id}/e2e-tone-one-[a-z0-9]+\\.mp3$`));
  expect(mime1).toBe('audio/mpeg');
  expect(bytes1).toBe(String(first.length));
  expect(['', '3'], 'the length is optional; when the browser reads it, it is about 2.6 s').toContain(seconds1);
  expect(objects(path1)).toBe('1');
  await expect(section).toContainText('audio/mpeg');
  await expect(section).toContainText('41 KB');
  await expect(section.getByRole('status', { name: 'Audio status' })).toContainText('Users can play this file whenever the song is live.');

  // The preview is a private signed link that really serves the file.
  await section.getByRole('button', { name: 'Preview (only you)' }).click();
  const player = section.locator('audio');
  await expect(player).toBeVisible();
  const src = (await player.getAttribute('src')) ?? '';
  expect(src).toContain('/storage/v1/object/sign/audio/');
  const served = await page.request.get(src);
  expect(served.status()).toBe(200);
  expect((await served.body()).length).toBe(first.length);

  // Replacing: the new file is in place and the old one is gone from storage.
  const second = silentMp3(60);
  await file.setInputFiles({ name: 'E2E Tone Two.mp3', mimeType: 'audio/mpeg', buffer: second });
  await section.getByRole('button', { name: 'Replace file' }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Replaced.' })).toBeVisible();
  const [path2, , bytes2] = audioRow(id);
  expect(path2).toMatch(new RegExp(`^${id}/e2e-tone-two-[a-z0-9]+\\.mp3$`));
  expect(bytes2).toBe(String(second.length));
  expect(objects(path2)).toBe('1');
  expect(objects(path1), 'the replaced file is deleted').toBe('0');

  // Removing needs a second click, and then both the song and storage are clean.
  await section.getByRole('button', { name: 'Remove recording' }).click();
  await section.getByRole('button', { name: 'Keep it' }).click();
  expect(audioRow(id)[0]).toBe(path2);
  await section.getByRole('button', { name: 'Remove recording' }).click();
  await section.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Removed.' })).toBeVisible();
  expect(audioRow(id)).toEqual(['', '', '', '']);
  expect(objects(path2)).toBe('0');
  await expect(section).toContainText('No recording yet');
});

test('the page says when an artist\'s agreement does not let users play the file', async ({ page }) => {
  const id = bareSong(SHALOM_ID, `e2e-song-audio-shalom-${Date.now()}`); // Shalom Choir's agreement has expired
  await signInAsAdmin(page);
  await page.goto(`/admin/songs/${id}`);
  const section = page.locator('section[aria-labelledby="recording"]');
  await section.locator('#audio-file').setInputFiles({ name: 'E2E Shalom.mp3', mimeType: 'audio/mpeg', buffer: silentMp3(40) });
  await section.getByRole('button', { name: 'Upload file' }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Uploaded.' })).toBeVisible();
  await expect(section.getByRole('status', { name: 'Audio status' })).toContainText('Users cannot play this file yet: No verified agreement is in force for this artist.');

  const [path] = audioRow(id);
  expect(path).not.toBe('');

  await section.getByRole('button', { name: 'Remove recording' }).click();
  await section.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Removed.' })).toBeVisible();
  expect(objects(path)).toBe('0');
});
