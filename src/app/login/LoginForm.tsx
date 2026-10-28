'use client';

import { Browser } from '@capacitor/browser';
import { Capacitor } from '@capacitor/core';
import { useState } from 'react';
import { NATIVE_AUTH_CALLBACK } from '@/lib/native-app';
import { createClient } from '@/lib/supabase/client';

// Real users sign in with Google only. The email and password form below exists for automated tests and local work:
// it appears only in a build made with NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN=1, and the hosted Supabase project must have its
// Email provider switched off, which is what actually enforces "Google only". Never set the flag in production.
const PASSWORD_LOGIN = process.env.NEXT_PUBLIC_ENABLE_PASSWORD_LOGIN === '1';

type Mode = 'in' | 'up';

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
      <h1>Sign in</h1>
      <p className="muted">Songs, lyrics and chords for your community. Sign in with your Google account to listen and read.</p>

      {error ? <p className="error" role="alert">{error}</p> : null}
      {deleted && info ? <p className="ok" role="status">{info}</p> : null}

      <button type="button" className="btn btn-primary btn-block" onClick={onGoogle} disabled={busy}>
        Continue with Google
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
