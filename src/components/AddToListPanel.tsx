'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';

type ListRow = { id: string; name: string; kind: 'playlist' | 'setlist' };
type Status = { ok: boolean; text: string; listId?: string } | null;

function explain(code: string | undefined): string {
  if (code === '54000') return 'That list is full (200 songs).';
  if (code === '42501') return 'This song cannot be added right now.';
  return 'Could not add the song. Please try again.';
}

/** Choose one of your playlists or setlists, or start a new one, and the song goes to the end of it.
 *  Used by the "Add to list" button on a song page and by the song menu. */
export default function AddToListPanel({ songId, userId, onAdded }: { songId: string; userId: string; onAdded?: (listName: string) => void }) {
  const [lists, setLists] = useState<ListRow[] | null>(null);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  useEffect(() => {
    let alive = true;
    void (async () => {
      const { data, error } = await createClient().from('playlists').select('id, name, kind').order('created_at', { ascending: false });
      if (!alive) return;
      if (error) setStatus({ ok: false, text: 'Could not load your lists.' });
      else setLists((data ?? []) as ListRow[]);
    })();
    return () => {
      alive = false;
    };
  }, []);

  function added(list: ListRow) {
    setStatus({ ok: true, text: `Added to ${list.name}.`, listId: list.id });
    onAdded?.(list.name);
  }

  async function addTo(list: ListRow) {
    setBusy(true);
    setStatus(null);
    const { error } = await createClient().rpc('add_to_playlist', { p_playlist: list.id, p_song: songId });
    setBusy(false);
    if (error) setStatus({ ok: false, text: explain(error.code) });
    else added(list);
  }

  async function createAndAdd(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setStatus(null);
    const supabase = createClient();
    const created = await supabase.from('playlists').insert({ user_id: userId, name: newName.trim() }).select('id, name, kind').single();
    if (created.error || !created.data) {
      setBusy(false);
      setStatus({ ok: false, text: created.error?.code === '54000' ? 'You have reached the limit of 100 lists.' : 'Could not create the list.' });
      return;
    }
    const list = created.data as ListRow;
    setLists((cur) => [list, ...(cur ?? [])]);
    setNewName('');
    const { error } = await supabase.rpc('add_to_playlist', { p_playlist: list.id, p_song: songId });
    setBusy(false);
    if (error) setStatus({ ok: false, text: explain(error.code) });
    else added(list);
  }

  return (
    <div className="add-panel">
      {lists === null && !status ? <p className="small muted">Loading your lists…</p> : null}
      {lists && lists.length > 0 ? (
        <ul className="plain-list pick-list" aria-label="Your lists">
          {lists.map((l) => (
            <li key={l.id}>
              <button type="button" className="btn btn-block pick-btn" disabled={busy} onClick={() => void addTo(l)}>
                {l.name}
                <span className="small muted">{l.kind === 'setlist' ? 'Setlist' : 'Playlist'}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {lists && lists.length === 0 ? <p className="small muted">You have no lists yet. Start one below.</p> : null}
      <form onSubmit={createAndAdd} className="new-inline">
        <label htmlFor="quick-list" className="small">New playlist</label>
        <input id="quick-list" className="input" maxLength={80} value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Name" />
        <button type="submit" className="btn btn-primary" disabled={busy || newName.trim() === ''}>Create and add</button>
      </form>
      {status ? (
        <p className={status.ok ? 'ok' : 'error'} role={status.ok ? 'status' : 'alert'}>
          {status.text}{' '}
          {status.listId ? <Link href={`/library/${status.listId}`} className="inline">Open list</Link> : null}
        </p>
      ) : null}
    </div>
  );
}
