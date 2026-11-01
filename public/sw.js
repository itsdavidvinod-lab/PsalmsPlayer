// PsalmsPlayer offline shell (service worker). Registered only inside the Android app, and only for people who have saved songs.
//
// What it does, and nothing more:
//   * Keeps a copy of the downloads page (/offline) and the scripts, styles and fonts that page needs.
//   * When the app is opened (or a page is asked for) and the network cannot be reached, it shows that page instead of the generic
//     "you are offline" screen. The page reads the saved songs from the phone's storage and plays them.
// Everything else goes straight to the network, exactly as if this file did not exist. No pages, no data and no account
// information are ever stored here: /offline is the same public page for everyone, and the songs live in IndexedDB.
//
// The cache is rebuilt as a whole and swapped in only when complete, so the stored page and its files always belong together.

'use strict';

const SHELL_URL = '/offline';
const CACHE_PREFIX = 'pp-offline-shell-'; // the same text as SHELL_CACHE_PREFIX in src/lib/offline/shell.ts
const META_URL = '/__shell-meta';
const REFRESH_AFTER_MS = 6 * 60 * 60 * 1000;

self.addEventListener('install', (event) => {
  self.skipWaiting();
  // An install that cannot reach the site yet is not a failure: the page asks for a refresh again when it can.
  event.waitUntil(buildShell().catch(() => {}));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'refresh') event.waitUntil(refreshIfStale());
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    event.respondWith(handleNavigation(request, url));
  } else if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(handleStatic(request));
  }
});

// ---------------------------------------------------------------- answering requests

async function handleNavigation(request, url) {
  try {
    return await fetch(request);
  } catch (error) {
    // No connection. Show the downloads, if they can be shown; otherwise let the app's own offline screen appear.
    const cache = await completeCache();
    if (!cache) throw error;
    if (url.pathname === SHELL_URL) {
      const page = await cache.match(SHELL_URL);
      if (page) return page;
      throw error;
    }
    return Response.redirect(SHELL_URL, 302);
  }
}

// Files under /_next/static/ have the content's fingerprint in their name, so a stored copy is always right.
// The query string (a deployment id, sometimes) is ignored for the same reason.
async function handleStatic(request) {
  const stored = await caches.match(request, { ignoreSearch: true, ignoreVary: true });
  if (stored) return stored;
  return fetch(request);
}

// ---------------------------------------------------------------- building the stored copy

let building = null;

function buildShell() {
  if (!building) {
    building = doBuild().finally(() => {
      building = null;
    });
  }
  return building;
}

async function doBuild() {
  const name = CACHE_PREFIX + Date.now();
  const cache = await caches.open(name);
  try {
    const page = await fetch(SHELL_URL, { cache: 'reload', credentials: 'omit' });
    if (!page.ok || page.redirected || !/text\/html/.test(page.headers.get('content-type') || '')) throw new Error('shell page');
    const html = await page.clone().text();
    await cache.put(SHELL_URL, page);

    const seen = new Set();
    const queue = [];
    const add = (path) => {
      const key = path.split('?')[0];
      if (seen.has(key)) return;
      seen.add(key);
      queue.push(path);
    };
    assetsIn(html).forEach(add);

    // A few at a time; a stylesheet can name fonts, which join the queue.
    while (queue.length > 0) {
      const batch = queue.splice(0, 6);
      await Promise.all(
        batch.map(async (path) => {
          const res = await fetch(path, { credentials: 'omit' });
          if (!res.ok) throw new Error('asset ' + path);
          if (path.split('?')[0].endsWith('.css')) assetsIn(await res.clone().text()).forEach(add);
          await cache.put(path, res);
        }),
      );
    }

    await cache.put(META_URL, new Response(String(Date.now())));
  } catch (error) {
    await caches.delete(name);
    throw error;
  }
  // Complete: the older copies are no longer needed.
  for (const key of await caches.keys()) {
    if (key.startsWith(CACHE_PREFIX) && key !== name) await caches.delete(key);
  }
}

// Every /_next/static/ file named in a page or a stylesheet, written either as "/_next/static/..." or, inside the page's data, as
// "static/...". Returned as paths on this site.
function assetsIn(text) {
  const out = [];
  const re = /(?:\/_next\/)?(static\/(?:chunks|css|media)\/[^"'\\\s)<>?]+\.(?:js|css|woff2?|ttf|otf|svg|png|jpe?g|webp|json))(\?[^"'\\\s)<>]*)?/g;
  let m;
  while ((m = re.exec(text)) !== null) out.push('/_next/' + m[1] + (m[2] || ''));
  return out;
}

// The newest stored copy that was finished (the one being built has no stamp yet).
async function completeCache() {
  const names = (await caches.keys()).filter((k) => k.startsWith(CACHE_PREFIX)).sort().reverse();
  for (const name of names) {
    const cache = await caches.open(name);
    if (await cache.match(META_URL)) return cache;
  }
  return null;
}

async function refreshIfStale() {
  const cache = await completeCache();
  if (cache) {
    const stamp = await cache.match(META_URL);
    const at = stamp ? Number(await stamp.text()) : 0;
    if (Date.now() - at < REFRESH_AFTER_MS) return;
  }
  try {
    await buildShell();
  } catch (error) {
    // Offline or the site is down: the copy that is there keeps working.
  }
}
