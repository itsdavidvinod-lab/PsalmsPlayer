// Offline downloads in the Android app: the Download item, saving a song, playing it and reading its lyrics with no connection, and
// every way the saved copy goes away (the artist's right withdrawn, signing out). Runs as the app (its user agent) against the real
// Supabase stack and the real service worker. A normal browser must see none of it.
import { expect, test, type Page } from '@playwright/test';
import { SONG_ONE_ID, audioTime, ensureAudio, signUpAndIn, sql, uniqueEmail } from './helpers';

test.describe.configure({ mode: 'serial' });

const APP_UA = 'Mozilla/5.0 (Linux; Android 15; Pixel) AppleWebKit/537.36 Chrome/150.0 Mobile Safari/537.36 PsalmsPlayerApp/1';
const GRACE_AGREEMENT = 'b0000000-0000-0000-0000-000000000001'; // Grace Worship Team: lyrics, chords and audio allowed in the seed data
const SONG = 'Placeholder Song One';

function setOfflineRight(on: boolean) {
  sql(`update public.agreements set allow_offline = ${on} where id = '${GRACE_AGREEMENT}'`);
}

/** Opens the ⋮ menu of the song in a search result and returns the sheet. */
async function openMenu(page: Page) {
  await page.goto('/search?q=placeholder%20song%20one');
  await page.getByRole('button', { name: `More options for ${SONG}` }).first().click();
  const sheet = page.getByRole('dialog', { name: `Options for ${SONG}` });
  await expect(sheet).toBeVisible();
  return sheet;
}

async function download(page: Page) {
  const sheet = await openMenu(page);
  await sheet.getByRole('button', { name: 'Download for offline' }).click();
  await expect(page.getByRole('status').filter({ hasText: `Saved for offline: ${SONG}.` })).toBeVisible({ timeout: 30_000 });
}

/** How many songs the phone's storage holds, counted straight from the browser database. */
async function savedCount(page: Page): Promise<number> {
  return page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('psalmsplayer-offline');
        open.onerror = () => resolve(-1);
        open.onsuccess = () => {
          const db = open.result;
          if (!db.objectStoreNames.contains('songs')) return resolve(0);
          const req = db.transaction('songs').objectStore('songs').count();
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(-1);
        };
      }),
  );
}

async function shellReady(page: Page): Promise<boolean> {
  return page.evaluate(async () => {
    for (const key of await caches.keys()) {
      if (!key.startsWith('pp-offline-shell-')) continue;
      if (await (await caches.open(key)).match('/__shell-meta')) return true;
    }
    return false;
  });
}

test.describe('inside the app', () => {
  test.use({ userAgent: APP_UA });

  test.beforeEach(async ({ context, request }) => {
    await ensureAudio(request, SONG_ONE_ID);
    await context.addCookies([{ name: 'pp_welcome', value: '1', url: 'http://localhost:3000' }]);
  });
  test.afterEach(() => setOfflineRight(false));

  test('without the artist\'s offline right there is no Download item', async ({ page }) => {
    setOfflineRight(false);
    await signUpAndIn(page, uniqueEmail('offline-off'));
    const sheet = await openMenu(page);
    await expect(sheet.getByRole('button', { name: /Download/ })).toHaveCount(0);
    await expect(sheet.getByRole('link', { name: 'Stage mode' })).toBeVisible(); // the rest of the menu is there
  });

  test('a song is saved, then plays and shows its lyrics with the connection cut', async ({ page, context }) => {
    test.setTimeout(120_000);
    setOfflineRight(true);
    await signUpAndIn(page, uniqueEmail('offline-on'));
    await download(page);

    // The row says so, the menu offers to remove it, and Settings lists it.
    await page.goto('/search?q=placeholder%20song%20one');
    await expect(page.getByRole('img', { name: 'Downloaded' })).toBeVisible();
    await page.goto('/settings');
    await page.getByRole('link', { name: /Downloads/ }).click();
    await expect(page).toHaveURL(/\/settings\/downloads$/);
    await expect(page.getByText(/^1 song · /)).toBeVisible();
    await expect(page.locator('.song-row')).toHaveCount(1);
    expect(await savedCount(page)).toBe(1);

    // The offline page is stored in the background once something is saved.
    await expect.poll(() => shellReady(page), { timeout: 30_000 }).toBe(true);

    // Opening the app with no connection lands on the downloads, which still play.
    await context.setOffline(true);
    await page.goto('/');
    await expect(page).toHaveURL(/\/offline$/);
    await expect(page.getByRole('heading', { name: 'Downloads', level: 1 })).toBeVisible();
    await expect(page.getByRole('status').filter({ hasText: 'Offline' })).toBeVisible();
    await expect(page.locator('.song-row')).toHaveCount(1);
    await expect(page.locator('.song-row .song-title')).toHaveText(SONG);

    await page.getByRole('button', { name: `Play ${SONG}` }).click();
    await expect.poll(() => audioTime(page), { timeout: 20_000 }).toBeGreaterThan(1);
    expect(await page.evaluate(() => (document.querySelector('audio') as HTMLAudioElement).currentSrc.startsWith('blob:')), 'it plays from the phone, not the network').toBe(true);

    // Its lyrics open, with the chords the artist allowed.
    await page.getByRole('button', { name: `Open ${SONG}` }).click();
    await expect(page.getByText('Placeholder line one of the')).toBeVisible();
    await expect(page.locator('.seg-chord').first()).toBeVisible();
    await expect(page.getByRole('region', { name: 'Listen' })).toBeVisible();
    await page.getByRole('button', { name: 'Back to downloads' }).click();
    await expect(page.locator('.song-row')).toHaveCount(1);

    // The connection returns: the page says so and offers the way back into the app.
    await context.setOffline(false);
    await expect(page.getByRole('status').filter({ hasText: 'Back online' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Open PsalmsPlayer' })).toBeVisible();
  });

  test('when the artist withdraws the right, the copy is deleted the next time the app is online', async ({ page }) => {
    test.setTimeout(120_000);
    setOfflineRight(true);
    await signUpAndIn(page, uniqueEmail('offline-withdraw'));
    await download(page);
    await page.goto('/settings/downloads');
    await expect(page.locator('.song-row')).toHaveCount(1);

    setOfflineRight(false);
    await page.evaluate(() => window.dispatchEvent(new Event('online'))); // what the phone does when the connection returns
    await expect(page.getByText('Nothing is saved on this phone yet.')).toBeVisible({ timeout: 20_000 });
    expect(await savedCount(page)).toBe(0);
  });

  test('signing out removes the downloads from the phone', async ({ page }) => {
    test.setTimeout(120_000);
    setOfflineRight(true);
    await signUpAndIn(page, uniqueEmail('offline-signout'));
    await download(page);
    await page.goto('/settings/account');
    await expect(page.getByText('Signing out removes your downloads from this phone.')).toBeVisible();
    await page.getByRole('button', { name: 'Sign out' }).click();
    await expect(page).toHaveURL(/\/login/);
    expect(await savedCount(page)).toBe(0);
  });

  test('a song can be removed from its own menu', async ({ page }) => {
    test.setTimeout(120_000);
    setOfflineRight(true);
    await signUpAndIn(page, uniqueEmail('offline-remove'));
    await download(page);
    const sheet = await openMenu(page);
    await sheet.getByRole('button', { name: 'Downloaded · Remove download' }).click();
    await expect(page.getByRole('status').filter({ hasText: `Removed from downloads: ${SONG}.` })).toBeVisible();
    expect(await savedCount(page)).toBe(0);
    const again = await openMenu(page);
    await expect(again.getByRole('button', { name: 'Download for offline' })).toBeVisible();
  });
});

test('a normal browser never sees any of it, even when the artist allows it', async ({ page }) => {
  setOfflineRight(true);
  try {
    await signUpAndIn(page, uniqueEmail('offline-web'));
    await page.goto('/search?q=placeholder%20song%20one');
    await page.getByRole('button', { name: `More options for ${SONG}` }).first().click();
    const sheet = page.getByRole('dialog', { name: `Options for ${SONG}` });
    await expect(sheet.getByRole('link', { name: 'Stage mode' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /Download/ })).toHaveCount(0);
    await page.goto('/settings');
    await expect(page.getByRole('link', { name: /Downloads/ })).toHaveCount(0);
    expect(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length)).toBe(0);
  } finally {
    setOfflineRight(false);
  }
});

test('the offline page and the worker are public and hold no account data', async ({ request }) => {
  const page = await request.get('/offline', { maxRedirects: 0 });
  expect(page.status(), '/offline opens without signing in').toBe(200);
  expect(await page.text()).not.toContain('@example.test');
  const worker = await request.get('/sw.js', { maxRedirects: 0 });
  expect(worker.status(), '/sw.js opens without signing in, with no redirect').toBe(200);
  expect(worker.headers()['content-type']).toMatch(/javascript/);
});
