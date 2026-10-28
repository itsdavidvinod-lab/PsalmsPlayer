// Pictures an admin uploads from their own device: shrunk in the browser, kept in the public "pictures" bucket,
// written by admins only, and shown by their address. Runs on the real Supabase stack.
import { deflateSync } from 'node:zlib';
import { expect, test } from '@playwright/test';
import { ANON_KEY, GRACE_ID, SUPABASE_URL, createApiUser, signInAsAdmin, sql } from './helpers';

test.describe.configure({ mode: 'serial' });

let originalPhoto = '';
test.beforeAll(() => {
  originalPhoto = sql(`select coalesce(photo_url, '') from public.artists where id = '${GRACE_ID}'`);
});
test.afterAll(() => {
  sql(`update public.artists set photo_url = ${originalPhoto === '' ? 'null' : `'${originalPhoto.replace(/'/g, "''")}'`} where id = '${GRACE_ID}'`);
});

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const out = Buffer.alloc(8 + data.length + 4);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}
/** A plain blue PNG of the given size, so the test has a real, large picture to shrink. */
function makePng(width: number, height: number): Buffer {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(width, 0);
  header.writeUInt32BE(height, 4);
  header[8] = 8; // bit depth
  header[9] = 2; // colour type: RGB
  const row = Buffer.alloc(1 + width * 3);
  for (let x = 0; x < width; x++) {
    row[1 + x * 3] = 40;
    row[2 + x * 3] = 90;
    row[3 + x * 3] = 200;
  }
  const raw = Buffer.concat(Array.from({ length: height }, () => row));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', header), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

test('choose a picture: it is shrunk, uploaded, shown, kept by Save, and anyone can fetch it by its address', async ({ page, request }) => {
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
  await field.scrollIntoViewIfNeeded(); // the small preview loads lazily
  await expect.poll(() => field.locator('img.cover').evaluate((img) => (img as HTMLImageElement).naturalWidth)).toBe(800);

  // Anyone, signed in or not, can fetch it by its address: it is a small picture, not the 2400 px original.
  const shown = await request.get(address);
  expect(shown.ok(), 'a public picture can be fetched without signing in').toBeTruthy();
  expect(shown.headers()['content-type']).toMatch(/^image\/(webp|jpeg)$/);
  const bytes = (await shown.body()).length;
  expect(bytes).toBeGreaterThan(0);
  expect(bytes).toBeLessThan(200 * 1024);

  // Nothing is kept until Save.
  expect(sql(`select coalesce(photo_url, '') from public.artists where id = '${GRACE_ID}'`)).toBe(originalPhoto);
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  expect(sql(`select photo_url from public.artists where id = '${GRACE_ID}'`)).toBe(address);
  await page.reload();
  await expect(page.locator('#artist-photo')).toHaveValue(address);

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
