'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { PauseIcon, PlayIcon } from '@/components/icons';
import { usePlayer } from '@/components/player/PlayerProvider';
import { transposeKey } from '@/lib/chordpro';
import { createClient } from '@/lib/supabase/client';
import type { Playlist, PlaylistRow, Song } from '@/lib/types';

type Status = { ok: boolean; text: string } | null;

/** The twelve keys, spelled the way the song's own key is (major keys for a major song, minor keys for a minor one). */
function keyChoices(songKey: string): string[] {
  return Array.from({ length: 12 }, (_, i) => transposeKey(songKey, i));
}

export default function PlaylistView({ playlist, rows: initialRows }: { playlist: Playlist; rows: PlaylistRow[] }) {
  const router = useRouter();
  const player = usePlayer();
  const [rows, setRows] = useState(initialRows);
  const [name, setName] = useState(playlist.name);
  const [shownName, setShownName] = useState(playlist.name);
  const [date, setDate] = useState(playlist.service_date ?? '');
  const [shownDate, setShownDate] = useState(playlist.service_date);
  const [status, setStatus] = useState<Status>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const isSetlist = playlist.kind === 'setlist';

  const songs: Song[] = rows.flatMap((r) => (r.song ? [r.song] : []));
  const firstPlayable = songs.find((s) => s.has_audio);

  async function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = rows.slice();
    [next[index], next[target]] = [next[target], next[index]];
    const before = rows;
    setRows(next);
    setStatus(null);
    const { error } = await createClient().rpc('reorder_playlist', { p_playlist: playlist.id, p_item_ids: next.map((r) => r.item_id) });
    if (error) {
      setRows(before);
      setStatus({ ok: false, text: 'Could not change the order. Please try again.' });
    }
  }

  async function remove(itemId: string) {
    setStatus(null);
    const { error } = await createClient().from('playlist_items').delete().eq('id', itemId);
    if (error) setStatus({ ok: false, text: 'Could not remove that song. Please try again.' });
    else setRows((cur) => cur.filter((r) => r.item_id !== itemId));
  }

  async function setKey(itemId: string, key: string) {
    setStatus(null);
    const { error } = await createClient()
      .from('playlist_items')
      .update({ key_override: key === '' ? null : key })
      .eq('id', itemId);
    if (error) setStatus({ ok: false, text: 'Could not change the key. Please try again.' });
    else setRows((cur) => cur.map((r) => (r.item_id === itemId ? { ...r, key_override: key === '' ? null : key } : r)));
  }

  async function saveDetails(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    const { error } = await createClient()
      .from('playlists')
      .update({ name: name.trim(), service_date: isSetlist && date ? date : null })
      .eq('id', playlist.id);
    if (error) {
      setStatus({ ok: false, text: 'Could not save. Please try again.' });
    } else {
      setShownName(name.trim());
      setShownDate(isSetlist && date ? date : null);
      setStatus({ ok: true, text: 'Saved.' });
      router.refresh();
    }
  }

  async function deleteList() {
    const { error } = await createClient().from('playlists').delete().eq('id', playlist.id);
    if (error) {
      setStatus({ ok: false, text: 'Could not delete the list. Please try again.' });
      setConfirmDelete(false);
    } else {
      router.push('/library');
      router.refresh();
    }
  }

  return (
    <article>
      <p className="small" style={{ margin: '8px 0 0' }}>
        <Link href="/library" className="inline">Library</Link>
      </p>
      <div className="song-head">
        <h1>{shownName}</h1>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          {isSetlist ? 'Setlist' : 'Playlist'}
          {shownDate ? ` · ${shownDate}` : ''}
          {` · ${rows.length} ${rows.length === 1 ? 'song' : 'songs'}`}
        </p>
      </div>

      <div className="toolbar">
        {firstPlayable ? (
          <button type="button" className="btn btn-primary" onClick={() => player.playQueue(songs, firstPlayable.id)}>
            <PlayIcon size={18} /> Play all
          </button>
        ) : null}
        {songs.length > 0 ? (
          <Link href={`/stage/setlist/${playlist.id}`} className="btn">Stage mode</Link>
        ) : null}
      </div>

      {status ? <p className={status.ok ? 'ok' : 'error'} role={status.ok ? 'status' : 'alert'}>{status.text}</p> : null}

      {rows.length === 0 ? (
        <div className="card empty">
          <p>No songs yet. Open a song and choose &ldquo;Add to list&rdquo;.</p>
          <Link href="/browse" className="btn btn-primary">Browse songs</Link>
        </div>
      ) : (
        <ol className="song-list plain-list" aria-label="Songs in this list">
          {rows.map((r, i) => {
            const song = r.song;
            const isCurrent = song ? player.current?.id === song.id : false;
            const busy = isCurrent && player.playing;
            const label = song ? song.title : `slot ${i + 1}`;
            return (
              <li key={r.item_id} className={`song-row${isCurrent ? ' song-row-current' : ''}`}>
                <span className="slot-no" aria-hidden="true">{i + 1}</span>
                {song?.has_audio ? (
                  <button
                    type="button"
                    className="round-play round-play-sm"
                    aria-label={busy ? `Pause ${song.title}` : `Play ${song.title}`}
                    onClick={() => (isCurrent ? player.toggle() : player.playQueue(songs, song.id))}
                  >
                    {busy ? <PauseIcon size={18} /> : <PlayIcon size={18} />}
                  </button>
                ) : (
                  <span className="round-play-gap" aria-hidden="true" />
                )}
                {song ? (
                  <Link href={`/song/${song.slug}`} className="song-main">
                    <span className="song-title">{song.title}</span>
                    <span className="small muted">{song.artist_name}</span>
                  </Link>
                ) : (
                  <span className="song-main">
                    <span className="song-title muted">Not available right now</span>
                    <span className="small muted">This slot keeps its place.</span>
                  </span>
                )}
                {song && isSetlist && song.musical_key ? (
                  <select
                    className="input key-select"
                    aria-label={`Key for ${song.title}`}
                    value={r.key_override ?? ''}
                    onChange={(e) => void setKey(r.item_id, e.target.value)}
                  >
                    <option value="">{`Key ${song.musical_key}`}</option>
                    {keyChoices(song.musical_key)
                      .filter((k) => k !== song.musical_key)
                      .map((k) => (
                        <option key={k} value={k}>{`Key ${k}`}</option>
                      ))}
                  </select>
                ) : null}
                <div className="row-actions">
                  <button type="button" className="icon-btn" aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => void move(i, -1)}>↑</button>
                  <button type="button" className="icon-btn" aria-label={`Move ${label} down`} disabled={i === rows.length - 1} onClick={() => void move(i, 1)}>↓</button>
                  <button type="button" className="icon-btn" aria-label={`Remove ${label}`} onClick={() => void remove(r.item_id)}>✕</button>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      <details className="section card">
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Edit this list</summary>
        <form onSubmit={saveDetails} style={{ marginTop: 12 }}>
          <div className="field">
            <label htmlFor="edit-name">Name</label>
            <input id="edit-name" className="input" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {isSetlist ? (
            <div className="field">
              <label htmlFor="edit-date">Service date</label>
              <input id="edit-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
          ) : null}
          <button type="submit" className="btn btn-primary" disabled={name.trim() === ''}>Save</button>
        </form>
        <div style={{ marginTop: 16 }}>
          {confirmDelete ? (
            <div className="toolbar">
              <span>Delete this list for good?</span>
              <button type="button" className="btn" onClick={() => void deleteList()}>Yes, delete</button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
            </div>
          ) : (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>Delete list</button>
          )}
        </div>
      </details>
    </article>
  );
}
