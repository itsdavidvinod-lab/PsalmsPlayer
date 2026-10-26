'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';

export default function NewListForm({ userId }: { userId: string }) {
  const router = useRouter();
  const [name, setName] = useState('');
  const [kind, setKind] = useState<'playlist' | 'setlist'>('playlist');
  const [date, setDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const { data, error: err } = await createClient()
      .from('playlists')
      .insert({ user_id: userId, name: name.trim(), kind, service_date: kind === 'setlist' && date ? date : null })
      .select('id')
      .single();
    if (err || !data) {
      setError(err?.code === '54000' ? 'You have reached the limit of 100 lists.' : 'Could not create the list. Please try again.');
      setBusy(false);
      return;
    }
    router.push(`/library/${data.id}`);
  }

  return (
    <form onSubmit={onSubmit} className="card">
      <div className="field">
        <label htmlFor="list-name">New list name</label>
        <input id="list-name" className="input" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="list-kind">Type</label>
        <select id="list-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as 'playlist' | 'setlist')}>
          <option value="playlist">Playlist (for listening)</option>
          <option value="setlist">Setlist (for a service, with Stage mode)</option>
        </select>
      </div>
      {kind === 'setlist' ? (
        <div className="field">
          <label htmlFor="list-date">Service date (optional)</label>
          <input id="list-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </div>
      ) : null}
      {error ? <p className="error" role="alert">{error}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={busy || name.trim() === ''}>Create list</button>
    </form>
  );
}
