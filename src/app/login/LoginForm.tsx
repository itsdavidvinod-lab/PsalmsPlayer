'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Mode = 'in' | 'up';

export default function LoginForm({ next, callbackFailed }: { next: string; callbackFailed: boolean }) {
  const [mode, setMode] = useState<Mode>('in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(callbackFailed ? 'Sign-in could not be completed. Please try again.' : null);
  const [info, setInfo] = useState<string | null>(null);

  const callbackUrl = () => `${window.location.origin}/auth/callback?next=${encodeURIComponent(next)}`;

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setInfo(null);
    try {
      const supabase = createClient();
      if (mode === 'in') {
        const { error: err } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        // One message for every failure, so the form does not reveal which emails have accounts.
        if (err) setError('Email or password is not correct, or the email is not confirmed yet.');
        else window.location.assign(next);
      } else {
        if (password.length < 8) {
          setError('Use a password of at least 8 characters.');
        } else {
          const { error: err } = await supabase.auth.signUp({
            email: email.trim(),
            password,
            options: { emailRedirectTo: callbackUrl() },
          });
          if (err) setError('Could not create the account. Check the email and try again.');
          else setInfo('If this email can be registered, a confirmation link is on its way. Open it, then sign in.');
        }
      }
    } finally {
      setBusy(false);
    }
  }

  async function onGoogle() {
    setBusy(true);
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: callbackUrl() } });
    if (err) {
      setError('Google sign-in is not available right now.');
      setBusy(false);
    }
  }

  return (
    <>
      <h1>{mode === 'in' ? 'Sign in' : 'Create account'}</h1>
      <p className="muted">Songs, lyrics and chords for your community.</p>

      {error ? <p className="error" role="alert">{error}</p> : null}
      {info ? <p className="ok" role="status">{info}</p> : null}

      <button type="button" className="btn btn-block" onClick={onGoogle} disabled={busy}>
        Continue with Google
      </button>
      <div className="divider">or</div>

      <form onSubmit={onSubmit}>
        <div className="field">
          <label htmlFor="email">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            className="input"
            type="password"
            autoComplete={mode === 'in' ? 'current-password' : 'new-password'}
            required
            minLength={mode === 'up' ? 8 : undefined}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </div>
        <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
          {mode === 'in' ? 'Sign in' : 'Create account'}
        </button>
      </form>

      <p className="small muted" style={{ marginTop: 16 }}>
        {mode === 'in' ? 'New here? ' : 'Already have an account? '}
        <button
          type="button"
          className="link-btn"
          onClick={() => {
            setMode(mode === 'in' ? 'up' : 'in');
            setError(null);
            setInfo(null);
          }}
        >
          {mode === 'in' ? 'Create an account' : 'Sign in'}
        </button>
      </p>
    </>
  );
}
