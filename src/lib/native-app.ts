// The Android (and later iOS) app is a thin native shell around this website. The shell adds this word to the browser's
// user agent, so the server can tell that a request comes from the app and not from a browser.

export const NATIVE_UA_MARKER = 'PsalmsPlayerApp';

export function isNativeUserAgent(userAgent: string | null | undefined): boolean {
  return typeof userAgent === 'string' && userAgent.includes(NATIVE_UA_MARKER);
}

/** The address Google sign-in returns to inside the app: Supabase sends the browser here, Android opens the app. */
export const NATIVE_AUTH_CALLBACK = 'com.psalmsplayer.app://auth-callback';

/** Turns the address the app was opened with into the page that finishes the sign-in on the website.
 *  Anything that is not our callback gives null. A callback without a code, or with an error, goes back to the sign-in page. */
export function nativeCallbackToWebPath(url: string): string | null {
  if (!url.startsWith(NATIVE_AUTH_CALLBACK)) return null;
  const rest = url.slice(NATIVE_AUTH_CALLBACK.length);
  if (rest !== '' && !rest.startsWith('?') && !rest.startsWith('#') && !rest.startsWith('/')) return null;
  let params: URLSearchParams;
  try {
    params = new URL(url).searchParams;
  } catch {
    return '/login?error=callback';
  }
  const code = params.get('code');
  if (!code || params.get('error') || !/^[A-Za-z0-9._~-]{8,200}$/.test(code)) return '/login?error=callback';
  return `/auth/callback?code=${encodeURIComponent(code)}&next=%2F`;
}
