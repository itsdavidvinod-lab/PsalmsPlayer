'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import Avatar from '@/components/Avatar';
import { createClient } from '@/lib/supabase/client';

/** Display name, and the picture from the person's Google account (shown here, changed in the Google account). */
export default function ProfileForm({ userId, displayName, email, pictureUrl }: { userId: string; displayName: string | null; email: string | null; pictureUrl: string | null }) {
  const router = useRouter();
  const [name, setName] = useState(displayName ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    // Only display name, languages and region can be changed by a user; the database rejects anything else (role included).
    const { error } = await createClient().from('profiles').update({ display_name: name.trim() || null }).eq('id', userId);
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: 'Could not save. Please try again.' });
    } else {
      setMsg({ ok: true, text: 'Saved.' });
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="card section">
      <div className="profile-photo">
        <Avatar name={name || email} url={pictureUrl} size={64} />
        <p className="small muted" style={{ margin: 0 }}>
          {pictureUrl ? 'Your picture comes from your Google account.' : 'No picture on your Google account, so your initial is shown.'}
        </p>
      </div>
      <div className="field">
        <label htmlFor="name">Display name</label>
        <input id="name" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </div>
      {msg ? <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>Save</button>
    </form>
  );
}
