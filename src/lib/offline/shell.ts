// The "offline shell": a small service worker (public/sw.js) that, when the app is opened with no connection, shows the downloads page
// (/offline) instead of the generic "you are offline" screen. It is registered only for people who have saved songs.

/** The same text as in public/sw.js. A test keeps the two together. */
export const SHELL_CACHE_PREFIX = 'pp-offline-shell-';

export function shellSupported(): boolean {
  return typeof navigator !== 'undefined' && 'serviceWorker' in navigator && typeof caches !== 'undefined';
}

/** Registers the worker and asks it to make sure the offline page is stored and fresh. Resolves to whether that worked. */
export async function ensureShell(): Promise<boolean> {
  if (!shellSupported()) return false;
  try {
    const registration = await navigator.serviceWorker.register('/sw.js', { scope: '/' });
    await navigator.serviceWorker.ready;
    (registration.active ?? navigator.serviceWorker.controller)?.postMessage({ type: 'refresh' });
    return true;
  } catch {
    return false;
  }
}

/** Removes the worker and everything it stored, for when nothing is saved on the phone any more. */
export async function dropShell(): Promise<void> {
  if (!shellSupported()) return;
  try {
    for (const registration of await navigator.serviceWorker.getRegistrations()) await registration.unregister();
    for (const key of await caches.keys()) if (key.startsWith(SHELL_CACHE_PREFIX)) await caches.delete(key);
  } catch {
    // Nothing more can be done; the worker only ever shows the downloads page.
  }
}
