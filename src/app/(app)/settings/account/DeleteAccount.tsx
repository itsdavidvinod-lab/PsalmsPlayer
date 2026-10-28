'use client';

import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type Step = 'idle' | 'confirm' | 'working';

/** Delete my account: two taps (the button, then the confirmation). Required by Google Play and the App Store.
 *  The database removes the sign-in record and everything tied to it. An admin account is refused, in the database too. */
export default function DeleteAccount({ isAdmin }: { isAdmin: boolean }) {
  const [step, setStep] = useState<Step>('idle');
  const [error, setError] = useState<string | null>(null);

  async function remove() {
    setStep('working');
    setError(null);
    const supabase = createClient();
    const { error: err } = await supabase.rpc('delete_my_account');
    if (err) {
      setError('Your account could not be deleted. Please try again in a moment.');
      setStep('confirm');
      return;
    }
    // The sign-in record is already gone; this only clears this device's copy of the session.
    await supabase.auth.signOut({ scope: 'local' });
    window.location.assign('/login?deleted=1');
  }

  if (isAdmin) {
    return (
      <section className="section" aria-labelledby="delete-account">
        <h2 id="delete-account">Delete account</h2>
        <p className="small muted">This is an administrator account, so it cannot be deleted from the app.</p>
      </section>
    );
  }

  return (
    <section className="section" aria-labelledby="delete-account">
      <h2 id="delete-account">Delete account</h2>
      <p className="small muted">
        Deleting your account removes your profile, liked songs, lists and setlists, followed artists and listening history. It cannot be
        undone. Your Google account is not affected.
      </p>
      {error ? <p className="error" role="alert">{error}</p> : null}
      {step === 'idle' ? (
        <button type="button" className="btn btn-block" onClick={() => setStep('confirm')}>Delete account</button>
      ) : (
        <div className="card" role="group" aria-label="Confirm account deletion">
          <p style={{ margin: '0 0 12px' }}><strong>Delete your account for good?</strong></p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            <button type="button" className="btn" onClick={remove} disabled={step === 'working'}>
              {step === 'working' ? 'Deleting…' : 'Yes, delete my account'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={() => setStep('idle')} disabled={step === 'working'}>Cancel</button>
          </div>
        </div>
      )}
    </section>
  );
}
