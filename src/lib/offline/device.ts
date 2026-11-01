// What is true of THIS phone: is offline use available here, and the one storage object the whole app shares.
// Offline use is for the Android app only; a normal browser never touches any of it.

import { isNativeUserAgent } from '../native-app.ts';
import { IdbStore, type OfflineStoreLike } from './store.ts';

/** True inside the Android app, on a device whose WebView has IndexedDB. Always false on the server and in a browser tab. */
export function offlineSupported(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return isNativeUserAgent(navigator.userAgent) && typeof indexedDB !== 'undefined';
  } catch {
    return false;
  }
}

let shared: OfflineStoreLike | null = null;

/** The phone's saved songs. Opened on first use, then kept. */
export function offlineStore(): OfflineStoreLike {
  if (!shared) shared = new IdbStore(indexedDB);
  return shared;
}
