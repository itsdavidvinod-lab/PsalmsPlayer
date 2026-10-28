'use client';

import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { useState } from 'react';
import { APP_NAME } from '@/lib/brand';
import { NATIVE_AUTH_CALLBACK } from '@/lib/native-app';
import { createClient } from '@/lib/supabase/client';

// Real users sign in with Google only. The email and password form below exists for automated tests and local work:
// it appears only in a build made with NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=1, and the hosted Supabase project must have its
// Email provider switched off, which is what actually enforces "Google only". Never set the flag in production.
const PASSWORD_LOGIN = process.env.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN === '1';

type Mode = 'in' | 'up';

/** Google's "G", exactly as in Google's sign-in branding guidelines (four colours, not to be recoloured or redrawn). */
function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 48 48" aria-hidden="true" focusable="false">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  );
}

export default function LoginForm({ next, callbackFailed, deleted = false }: { next: string; callbackFailed: boolean; deleted?: boolean }) {
  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(callbackFailed ? 'Sign-in could not be completed. Please try again.' : null);
  const [info, setInfo] = useState<string | null>(deleted ? 'Your account has been deleted.' : null);

  const callbackUrl = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function onGoogle() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    if (Capacitor.isNativePlatform()) {
      // Google refuses to sign anyone in inside an app's embedded browser. Open the phone's own browser instead; when Google is
      // done, Supabase sends it to NATIVE_AUTH_CALLBACK, Android opens the app, and NativeBridge finishes the sign-in here.
      const { data, error: err } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: NATIVE_AUTH_CALLBACK, skipBrowserRedirect: true },
      });
      if (err || !data.url) setError('Google sign-in is not available right now.');
      else await Browser.open({ url: data.url });
      setBusy(false);
      return;
    }
    const { error: err } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl() } });
    if (err) {
      setError('Google sign-in is not available right now.');
      setBusy(false);
    }
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      if (mode === 'in') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (err) setError('Email or password is not correct.');
        else window.location.assign(next);
      } else {
        const { error: err } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: callbackUrl() } });
        if (err) setError('Could not create the account.');
        else setInfo('If this email can be registered, a confirmation link is on its way. Open it, then sign in.');
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <h1>Welcome to {APP_NAME}</h1>
      <p className="signin-sub">Songs, lyrics and chords for your community.</p>

      {error ? <p className="error" role="alert">{error}</p> : null}
      {deleted && info ? <p className="ok" role="status">{info}</p> : null}

      <button type="button" className="btn-google" onClick={onGoogle} disabled={busy}>
        <GoogleMark />
        <span>Continue with Google</span>
      </button>

      {PASSWORD_LOGIN ? (
        <>
          <div className="divider">test builds only</div>
          {info && !deleted ? <p className="ok" role="status">{info}</p> : null}
          <form onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="email">Email</label>
              <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="password">Password</label>
              <input id="password" className="input" type="password" autoComplete={mode === 'in' ? 'current-password' : 'new-password'} required value={password} onChange={(e) => setPassword(e.target.value)} />
            </div>
            <button type="submit" className="btn btn-block" disabled={busy}>
              {mode === 'in' ? 'Sign in with email' : 'Create test account'}
            </button>
          </form>
          <p className="small muted" style={{ marginTop: 16 }}>
            <button type="button" className="link-btn" onClick={() => { setMode(mode === 'in' ? 'up' : 'in'); setError(null); setInfo(null); }}>
              {mode === 'in' ? 'Create a test account' : 'Back to sign in'}
            </button>
          </p>
        </>
      ) : null}
    </>
  );
}
