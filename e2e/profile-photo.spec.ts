// A person's own profile photo: chosen in Settings > Profile, cut to a small square in the browser, kept in their own folder of the public
// "avatars" bucket, replaced and removed from the same place, and deleted with the account. Runs on the real Supabase stack.
//
// The local test stack is http, and the database keeps only https addresses for a photo (the hosted project is https). So in the
// browser tests the one request that saves the address is made https on its way out; everything else is the real thing.
import { expect, test, type Page } from '@playwright/test';
import { ANON_KEY, SUPABASE_URL, apiHeaders, createApiUser, makePng, signUpAndIn, sql, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial' });

const AVATAR_FILE = (userId: string) => new RegExp(`^https://[^/]+/storage/v1/object/public/avatars/${userId}/[0-9a-f-]{36}\\.(webp|jpg)$`);
const asHttp = (url: string) => url.replace(/^https:/, 'http:');
const savedUrl = (userId: string) => sql(`select coalesce(avatar_url, '') from public.profiles where id = '${userId}'`);
const filesOf = (userId: string) => Number(sql(`select count(*) from storage.objects where bucket_id = 'avatars' and name like '${userId}/%'`));

/** Makes the profile update that carries a photo address go out as https (see the note at the top). */
async function allowHttpsForTheLocalStack(page: Page) {
  await page.route(/\/rest\/v1\/profiles(\?|$)/, async (route) => {
    const req = route.request();
    const body = req.method() === 'PATCH' ? (req.postDataJSON() as Record<string, unknown> | null) : null;
    if (body && typeof body.avatar_url === 'string') {
      return route.continue({ postData: JSON.stringify({ ...body, avatar_url: body.avatar_url.replace(/^http:/, 'https:') }) });
    }
    return route.continue();
  });
}

test('choose a photo: it is cut to a small square, kept in the person\'s own folder, shown, replaced, and removed', async ({ page, request }) => {
  const email = uniqueEmail('photo');
  await signUpAndIn(page, email);
  const userId = sql(`select id from auth.users where email = '${email}'`);
  await allowHttpsForTheLocalStack(page);

  await page.goto('/settings/profile');
  await expect(page.getByText('No photo yet, so your initial is shown.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove photo' })).toHaveCount(0);
  const file = page.locator('input[type=file][aria-label="Choose a profile photo"]');

  // Something that is not a picture is refused on the spot; nothing is stored.
  await file.setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByRole('alert').filter({ hasText: 'Choose a JPG, PNG or WebP picture.' })).toBeVisible();
  expect(filesOf(userId)).toBe(0);
  expect(savedUrl(userId)).toBe('');

  // A wide picture is cut to its middle, 256 px square, uploaded, and the profile points at it.
  await file.setInputFiles({ name: 'wide.png', mimeType: 'image/png', buffer: makePng(900, 500) });
  await expect(page.getByRole('status').filter({ hasText: 'Photo changed.' })).toBeVisible({ timeout: 20_000 });
  const first = savedUrl(userId);
  expect(first).toMatch(AVATAR_FILE(userId));
  expect(filesOf(userId)).toBe(1);
  await expect(page.getByRole('button', { name: 'Remove photo' })).toBeVisible();
  await expect(page.getByText('This is the photo you chose.')).toBeVisible();

  // It is a real picture, square and small, and anyone can fetch it by its address without signing in.
  const size = await page.evaluate(async (src) => {
    const img = new Image();
    img.src = src;
    await img.decode();
    return { w: img.naturalWidth, h: img.naturalHeight };
  }, asHttp(first));
  expect(size).toEqual({ w: 256, h: 256 });
  const fetched = await request.get(asHttp(first));
  expect(fetched.ok(), 'a profile photo can be fetched by its address').toBeTruthy();
  expect(fetched.headers()['content-type']).toMatch(/^image\/(webp|jpeg)$/);
  expect((await fetched.body()).length).toBeLessThan(100 * 1024);

  // Choosing another one replaces it: a new file, and the old one is deleted.
  await page.goto('/settings/profile');
  await expect(page.getByText('This is the photo you chose.')).toBeVisible();
  await file.setInputFiles({ name: 'second.png', mimeType: 'image/png', buffer: makePng(300, 300) });
  await expect(page.getByRole('status').filter({ hasText: 'Photo changed.' })).toBeVisible({ timeout: 20_000 });
  const second = savedUrl(userId);
  expect(second).toMatch(AVATAR_FILE(userId));
  expect(second).not.toBe(first);
  expect(filesOf(userId), 'the replaced photo is deleted').toBe(1);
  expect((await request.get(asHttp(first))).ok(), 'the old address no longer serves a photo').toBeFalsy();

  // Remove goes back to the initial (or the Google picture): the address is cleared and the file deleted.
  await page.goto('/settings/profile');
  await page.getByRole('button', { name: 'Remove photo' }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Photo removed.' })).toBeVisible();
  expect(savedUrl(userId)).toBe('');
  expect(filesOf(userId)).toBe(0);
  await expect(page.getByText('No photo yet, so your initial is shown.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove photo' })).toHaveCount(0);
});

test('the chosen photo is the one shown in Settings, and changing the display name keeps it', async ({ page }) => {
  const email = uniqueEmail('photo-shown');
  await signUpAndIn(page, email);
  const userId = sql(`select id from auth.users where email = '${email}'`);
  await allowHttpsForTheLocalStack(page);

  await page.goto('/settings/profile');
  await page.locator('input[type=file][aria-label="Choose a profile photo"]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: makePng(64, 64) });
  await expect(page.getByRole('status').filter({ hasText: 'Photo changed.' })).toBeVisible({ timeout: 20_000 });
  const url = savedUrl(userId);

  await page.getByLabel('Display name').fill('E2E Photo Person');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Saved.' })).toBeVisible();
  expect(savedUrl(userId)).toBe(url);
  expect(sql(`select display_name from public.profiles where id = '${userId}'`)).toBe('E2E Photo Person');

  // The settings page shows the chosen address (not the initial).
  await page.goto('/settings');
  await expect(page.locator(`img.avatar[src="${url}"]`).first()).toHaveCount(1);
});

test('the avatars bucket: each person works only in their own folder, picture types only, and a profile can point only at its own pictures', async ({ request }) => {
  const a = await createApiUser(request, 'avatar-a');
  const b = await createApiUser(request, 'avatar-b');
  const png = makePng(8, 8);
  const put = (token: string | null, path: string, type = 'image/png', data: Buffer = png) =>
    request.post(`${SUPABASE_URL}/storage/v1/object/avatars/${path}`, {
      headers: { apikey: ANON_KEY, ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': type },
      data,
    });

  expect((await put(null, `${a.userId}/anon.png`)).ok(), 'a visitor cannot upload').toBeFalsy();
  expect((await put(a.token, `${b.userId}/theirs.png`)).ok(), 'nobody can put a file in someone else\'s folder').toBeFalsy();
  expect((await put(a.token, 'loose.png')).ok(), 'nobody can put a file outside a person\'s folder').toBeFalsy();
  expect((await put(a.token, `${a.userId}/notes.txt`, 'text/plain', Buffer.from('hello'))).ok(), 'only pictures are accepted').toBeFalsy();
  expect((await put(a.token, `${a.userId}/big.png`, 'image/png', Buffer.alloc(600 * 1024, 1))).ok(), 'the bucket limit is 512 KB').toBeFalsy();
  const mine = await put(a.token, `${a.userId}/mine.png`);
  expect(mine.ok(), `a person can upload to their own folder: ${mine.status()} ${await mine.text()}`).toBeTruthy();

  // Public by address, but nothing can be listed or deleted by someone else.
  const shown = await request.get(`${SUPABASE_URL}/storage/v1/object/public/avatars/${a.userId}/mine.png`);
  expect(shown.ok(), 'a photo is fetched by its address without signing in').toBeTruthy();
  const listOf = async (token: string, prefix: string) => {
    const res = await request.post(`${SUPABASE_URL}/storage/v1/object/list/avatars`, { headers: apiHeaders(token), data: { prefix, limit: 10 } });
    return res.ok() ? ((await res.json()) as unknown[]).length : 0;
  };
  expect(await listOf(a.token, a.userId), 'a person lists their own folder').toBe(1);
  expect(await listOf(b.token, a.userId), 'nobody lists someone else\'s folder').toBe(0);
  await request.delete(`${SUPABASE_URL}/storage/v1/object/avatars/${a.userId}/mine.png`, { headers: apiHeaders(b.token) });
  expect((await request.get(`${SUPABASE_URL}/storage/v1/object/public/avatars/${a.userId}/mine.png`)).ok(), 'nobody deletes someone else\'s photo').toBeTruthy();

  // The profile can point only at a picture in the person's own folder of this bucket.
  const https = SUPABASE_URL.replace(/^http:/, 'https:');
  const point = (token: string, userId: string, address: string | null) =>
    request.patch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${userId}`, { headers: { ...apiHeaders(token), Prefer: 'return=representation' }, data: { avatar_url: address } });
  for (const bad of ['https://evil.example/photo.png', `${https}/storage/v1/object/public/avatars/${b.userId}/mine.png`, `${https}/storage/v1/object/public/pictures/artist/x.png`, 'javascript:alert(1)']) {
    expect((await point(a.token, a.userId, bad)).ok(), `refused: ${bad}`).toBeFalsy();
  }
  expect(savedUrl(a.userId)).toBe('');
  const ok = await point(a.token, a.userId, `${https}/storage/v1/object/public/avatars/${a.userId}/mine.png`);
  expect(ok.ok(), 'their own picture is accepted').toBeTruthy();
  expect(savedUrl(a.userId)).toBe(`${https}/storage/v1/object/public/avatars/${a.userId}/mine.png`);

  // Nobody else can change it.
  const other = await point(b.token, a.userId, null);
  expect(other.ok() ? ((await other.json()) as unknown[]).length : 0, 'a person cannot change someone else\'s profile').toBe(0);
  expect(savedUrl(a.userId)).not.toBe('');
});

test('deleting the account removes the photo with it', async ({ page, request }) => {
  const email = uniqueEmail('photo-leaver');
  await signUpAndIn(page, email);
  const userId = sql(`select id from auth.users where email = '${email}'`);
  await allowHttpsForTheLocalStack(page);

  await page.goto('/settings/profile');
  await page.locator('input[type=file][aria-label="Choose a profile photo"]').setInputFiles({ name: 'p.png', mimeType: 'image/png', buffer: makePng(64, 64) });
  await expect(page.getByRole('status').filter({ hasText: 'Photo changed.' })).toBeVisible({ timeout: 20_000 });
  const url = savedUrl(userId);
  expect(filesOf(userId)).toBe(1);

  await page.goto('/settings/account');
  await page.getByRole('button', { name: 'Delete account' }).click();
  await page.getByRole('button', { name: 'Yes, delete my account' }).click();
  await expect(page).toHaveURL(/\/login\?deleted=1$/);

  expect(sql(`select count(*) from public.profiles where id = '${userId}'`)).toBe('0');
  expect(filesOf(userId), 'no photo of theirs is left behind').toBe(0);
  expect((await request.get(asHttp(url))).ok(), 'the photo address stops working').toBeFalsy();
});
