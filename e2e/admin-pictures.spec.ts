// Pictures an admin uploads from their own device: shrunk in the browser, kept in the public "pictures" bucket,
// written by admins only, and shown by their address. Runs on the real Supabase stack.
import { expect, test } from '@playwright/test';
import { ANON_KEY, GRACE_ID, SUPABASE_URL, createApiUser, makePng, signInAsAdmin, sql } from './helpers';

test.describe.configure({ mode: 'serial' });

let originalPhoto = '';
test.beforeAll(() => {
  originalPhoto = sql(`select coalesce(photo_url, '') from public.artists where id = '${GRACE_ID}'`);
});
test.afterAll(() => {
  sql(`update public.artists set photo_url = ${originalPhoto === '' ? 'null' : `'${originalPhoto.replace(/'/g, "''")}'`} where id = '${GRACE_ID}'`);
});

test('choose a picture: it is shrunk, uploaded, put in the field, and anyone can fetch it by its address', async ({ page, request }) => {
  await signInAsAdmin(page);
  await page.goto(`/admin/artists/${GRACE_ID}`);
  const field = page.locator('.pic-field:has(#artist-photo)');

  // Something that is not a picture is refused on the spot.
  await field.locator('input[type=file]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByRole('alert').filter({ hasText: 'Choose a JPG, PNG or WebP picture.' })).toBeVisible();

  // A large picture is shrunk to 800 px wide, uploaded and its address put in the field.
  await field.locator('input[type=file]').setInputFiles({ name: 'big.png', mimeType: 'image/png', buffer: makePng(2400, 1200) });
  await expect(page.getByRole('status').filter({ hasText: 'Uploaded. Press Save to keep it.' })).toBeVisible();
  const address = await page.locator('#artist-photo').inputValue();
  expect(address).toMatch(/\/storage\/v1\/object\/public\/pictures\/artist\/[0-9a-f-]{36}\.(webp|jpg)$/);
  // The browser can decode it, and it is 800 px wide, not the 2400 px original. (The small preview next to the field only shows
  // https addresses, and the local test stack is http, so the picture is decoded here instead.)
  const width = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    return img.naturalWidth;
  }, address);
  expect(width).toBe(800);

  // Anyone, signed in or not, can fetch it by its address: it is a small picture, not the 2400 px original.
  const shown = await request.get(address);
  expect(shown.ok(), 'a public picture can be fetched without signing in').toBeTruthy();
  expect(shown.headers()['content-type']).toMatch(/^image\/(webp|jpeg)$/);
  const bytes = (await shown.body()).length;
  expect(bytes).toBeGreaterThan(0);
  expect(bytes).toBeLessThan(200 * 1024);

  // Nothing is kept until the form is saved. (Saving an uploaded address is not exercised here: the local stack is http and the
  // site only keeps https addresses. The hosted project is https. Saving a pasted https link is covered by the other admin specs.)
  expect(sql(`select coalesce(photo_url, '') from public.artists where id = '${GRACE_ID}'`)).toBe(originalPhoto);

  // Remove empties the field; pasting a link still works.
  await field.getByRole('button', { name: 'Remove picture' }).click();
  await expect(page.locator('#artist-photo')).toHaveValue('');
  await page.locator('#artist-photo').fill('https://example.org/pasted.jpg');
  await expect(page.locator('#artist-photo')).toHaveValue('https://example.org/pasted.jpg');
});

test('only an admin can put a picture in the bucket, and the bucket cannot be listed', async ({ request }) => {
  const user = await createApiUser(request, 'pic-user');
  const png = makePng(8, 8);
  const put = (token: string | null, name: string) =>
    request.post(`${SUPABASE_URL}/storage/v1/object/pictures/artist/${name}`, {
      headers: { apikey: ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'image/png' },
      data: png,
    });
  expect((await put(null, 'anon.png')).ok(), 'a visitor cannot upload').toBeFalsy();
  expect((await put(user.token, 'user.png')).ok(), 'a normal signed-in user cannot upload').toBeFalsy();

  // Listing the bucket is closed to everyone but admins.
  const list = await request.post(`${SUPABASE_URL}/storage/v1/object/list/pictures`, {
    headers: { apikey: ANON_KEY, Authorization: `Bearer ${user.token}`, 'Content-Type': 'application/json' },
    data: { prefix: 'artist', limit: 10 },
  });
  const listed = list.ok() ? ((await list.json()) as unknown[]) : [];
  expect(listed.length, 'a normal user sees no files in the bucket').toBe(0);
});
