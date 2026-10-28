'use client';

import { App } from '@capacitor/app';
import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { useEffect } from 'react';
import { nativeCallbackToWebPath } from '@/lib/native-app';

/** Inside the app only: when Google sign-in (done in the phone's own browser) hands control back to the app,
 *  finish the sign-in on the website. In a normal browser this does nothing. */
export default function NativeBridge() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    let handle: { remove(): Promise<void> } | null = null;
    let cancelled = false;
    App.addListener('appUrlOpen', async ({ url }) => {
      const path = nativeCallbackToWebPath(url);
      if (!path) return;
      try {
        await Browser.close();
      } catch {
        // Android closes the sign-in tab by itself when the app comes back; nothing to do.
      }
      window.location.assign(path);
    }).then((h) => {
      if (cancelled) void h.remove();
      else handle = h;
    });
    return () => {
      cancelled = true;
      if (handle) void handle.remove();
    };
  }, []);
  return null;
}
