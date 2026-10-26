// Admin Lists: adding, renaming and deleting languages, regions, genres, occasions and moods, with the rules that keep the rest of the site safe.
// Runs on the real Supabase stack. Everything created here is deleted again.
import { expect, test } from '@playwright/test';
import { signInAsAdmin, sql } from './helpers';

test.describe.configure({ mode: 'serial' });

test.afterAll(() => {
  sql(`delete from public.artists where slug like 'e2e-artist-%'`);
  sql(`delete from public.languages where code in ('qz', 'qzq')`);
  sql(`delete from public.regions where code = 'QZ-AA'`); // the state first: a country with states cannot be deleted
  sql(`delete from public.regions where code = 'QZ'`);
  sql(`delete from public.tags where code like 'e2e-%'`);
});

test('languages: add, refuse a bad or repeated code, rename, and delete; the code itself can never be edited', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin/lists');
  await expect(page.getByRole('heading', { name: 'Lists', level: 1 })).toBeVisible();
  const section = page.locator('section[aria-labelledby="lists-languages"]');
  await expect(section).toContainText('Tamil');

  await section.getByText('Add a language').click();
  await section.locator('#lang-new-code').fill('12');
  await section.locator('#lang-new-name').fill('E2E Testish');
  await section.getByRole('button', { name: 'Add language' }).click();
  await expect(section.getByRole('alert').filter({ hasText: '2 or 3 letters' })).toBeVisible();
  expect(sql(`select count(*) from public.languages where name = 'E2E Testish'`)).toBe('0');

  await section.locator('#lang-new-code').fill('QZ'); // tidied to lower case
  await section.getByRole('button', { name: 'Add language' }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Added.' })).toBeVisible();
  expect(sql(`select code || '|' || name || '|' || coalesce(native_name, 'none') from public.languages where code = 'qz'`)).toBe('qz|E2E Testish|none');

  await section.locator('#lang-new-code').fill('qz');
  await section.locator('#lang-new-name').fill('Again');
  await section.getByRole('button', { name: 'Add language' }).click();
  await expect(section.getByRole('alert').filter({ hasText: 'That code is already in the list.' })).toBeVisible();

  // Rename; the code is shown as text, not an input.
  const row = section.locator('details', { has: page.locator('#lang-qz-name') });
  await row.locator('summary').click();
  await expect(row.locator('#lang-qz-code')).toHaveCount(0);
  await row.locator('#lang-qz-name').fill('E2E Testish renamed');
  await row.locator('#lang-qz-native').fill('ZZ');
  await row.getByRole('button', { name: 'Save' }).click();
  await expect(row.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  expect(sql(`select name || '|' || native_name from public.languages where code = 'qz'`)).toBe('E2E Testish renamed|ZZ');

  // The new language is offered by the song form straight away.
  await page.goto('/admin/songs/new');
  await expect(page.locator('#song-language').locator('option', { hasText: 'E2E Testish renamed' })).toHaveCount(1);
  await page.goto('/admin/lists');

  // Delete: two clicks, and it is gone.
  const row2 = section.locator('details', { has: page.locator('#lang-qz-name') });
  await row2.locator('summary').click();
  await row2.getByRole('button', { name: 'Delete', exact: true }).click();
  await row2.getByRole('button', { name: 'Keep it' }).click();
  expect(sql(`select count(*) from public.languages where code = 'qz'`)).toBe('1');
  await row2.getByRole('button', { name: 'Delete', exact: true }).click();
  await row2.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(section.locator('#lang-qz-name')).toHaveCount(0);
  expect(sql(`select count(*) from public.languages where code = 'qz'`)).toBe('0');
});

test('a language that songs use cannot be deleted, and the page says what uses it', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin/lists');
  const section = page.locator('section[aria-labelledby="lists-languages"]');
  const row = section.locator('details', { has: page.locator('#lang-ta-name') });
  await row.locator('summary').click();
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  await row.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(row.getByRole('alert').filter({ hasText: 'This language is still in use' })).toBeVisible();
  await expect(row.getByRole('alert')).toContainText('songs:');
  expect(sql(`select count(*) from public.languages where code = 'ta'`)).toBe('1');
});

test('regions: a state needs its country, uppercase is applied, and a country with states cannot be deleted', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin/lists');
  const section = page.locator('section[aria-labelledby="lists-regions"]');

  await section.getByText('Add a region').click();
  await section.locator('#region-new-code').fill('QZZZ');
  await section.locator('#region-new-name').fill('E2E Testland');
  await section.getByRole('button', { name: 'Add region' }).click();
  await expect(section.getByRole('alert').filter({ hasText: 'A region code is a country' })).toBeVisible();

  await section.locator('#region-new-code').fill('qz');
  await section.getByRole('button', { name: 'Add region' }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Added.' })).toBeVisible();
  await section.locator('#region-new-code').fill('qz-aa');
  await section.locator('#region-new-name').fill('E2E Testland north');
  await section.getByRole('button', { name: 'Add region' }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Added.' })).toBeVisible();
  expect(sql(`select string_agg(code || ':' || country_code, ',' order by code) from public.regions where code like 'QZ%'`)).toBe('QZ:QZ,QZ-AA:QZ');

  const country = section.locator('details', { has: page.locator('#region-QZ-name') });
  await country.locator('summary').click();
  await country.getByRole('button', { name: 'Delete', exact: true }).click();
  await country.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(country.getByRole('alert').filter({ hasText: 'regions inside it: 1' })).toBeVisible();
  expect(sql(`select count(*) from public.regions where code = 'QZ'`)).toBe('1');

  const state = section.locator('details', { has: page.locator('#region-QZ-AA-name') });
  await state.locator('summary').click();
  await state.getByRole('button', { name: 'Delete', exact: true }).click();
  await state.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(section.locator('#region-QZ-AA-name')).toHaveCount(0);
  const country2 = section.locator('details', { has: page.locator('#region-QZ-name') });
  await country2.locator('summary').click();
  await country2.getByRole('button', { name: 'Delete', exact: true }).click();
  await country2.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(section.locator('#region-QZ-name')).toHaveCount(0);
  expect(sql(`select count(*) from public.regions where code like 'QZ%'`)).toBe('0');
});

test('genres: the code is suggested from the label, and a genre an artist uses is protected until it is let go', async ({ page }) => {
  await signInAsAdmin(page);
  await page.goto('/admin/lists');
  const section = page.locator('section[aria-labelledby="lists-genre"]');

  await section.getByText('Add a genre').click();
  await section.locator('#tag-genre-new-label').fill('E2E Hymnal');
  await expect(section.locator('#tag-genre-new-code')).toHaveValue('e2e-hymnal');
  await section.getByRole('button', { name: 'Add genre' }).click();
  await expect(section.getByRole('status').filter({ hasText: 'Added.' })).toBeVisible();
  expect(sql(`select label from public.tags where kind = 'genre' and code = 'e2e-hymnal'`)).toBe('E2E Hymnal');

  // Used by an artist: cannot be deleted, and the message counts the artist.
  sql(`insert into public.artists (slug, name, genres) values ('e2e-artist-lists-${Date.now()}', 'E2E Lists Artist', '{e2e-hymnal}')`);
  const row = section.locator('details', { has: page.locator('#tag-genre-e2e-hymnal-label') });
  await row.locator('summary').click();
  await row.getByRole('button', { name: 'Delete', exact: true }).click();
  await row.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(row.getByRole('alert').filter({ hasText: 'This genre is still in use (artists: 1, songs: 0' })).toBeVisible();
  expect(sql(`select count(*) from public.tags where code = 'e2e-hymnal'`)).toBe('1');

  // Rename is always fine; once the artist lets go, the genre can be deleted.
  await row.locator('#tag-genre-e2e-hymnal-label').fill('E2E Hymnal renamed');
  await row.getByRole('button', { name: 'Save' }).click();
  await expect(row.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  expect(sql(`select label from public.tags where code = 'e2e-hymnal'`)).toBe('E2E Hymnal renamed');
  sql(`delete from public.artists where slug like 'e2e-artist-lists-%'`);
  await page.goto('/admin/lists');
  const row2 = section.locator('details', { has: page.locator('#tag-genre-e2e-hymnal-label') });
  await row2.locator('summary').click();
  await row2.getByRole('button', { name: 'Delete', exact: true }).click();
  await row2.getByRole('button', { name: 'Yes, delete' }).click();
  await expect(section.locator('#tag-genre-e2e-hymnal-label')).toHaveCount(0);
  expect(sql(`select count(*) from public.tags where code = 'e2e-hymnal'`)).toBe('0');
});
