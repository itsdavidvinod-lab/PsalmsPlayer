'use client';

// One list, full screen: Liked songs, a playlist or a setlist. Find, Sort, filter chips, Shuffle and Play work on the phone.
// A playlist or setlist also has Edit: reorder, remove, choose a key (setlists), rename, change the date, delete.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { CheckIcon, ChevronLeftIcon, HeartIcon, ListIcon, PauseIcon, PlayIcon, PlusIcon, SearchIcon, ShuffleIcon, StageIcon } from '@/components/icons';
import { usePlayer } from '@/components/player/PlayerProvider';
import Sheet from '@/components/Sheet';
import { SongRow } from '@/components/SongRow';
import { transposeKey } from '@/lib/chordpro';
import { NO_CHIPS, SORT_MODES, isFiltering, listChips, songCountLabel, toggleChip, visibleSlots, type ChipSelection, type SortMode } from '@/lib/list';
import { createClient } from '@/lib/supabase/client';
import type { PlaylistRow, Song } from '@/lib/types';

export type ListKind = 'liked' | 'playlist' | 'setlist';

type Props = {
  kind: ListKind;
  /** The playlist's id. Null for Liked songs, which has no row of its own. */
  id: string | null;
  title: string;
  serviceDate: string | null;
  rows: PlaylistRow[];
  languageNames: Record<string, string>;
  genreLabels: Record<string, string>;
  /** Liked songs of one artist: a note after the count and a way back to all of them. */
  scope?: { label: string; clearHref: string } | null;
};

type Status = { ok: boolean; text: string } | null;

/** The twelve keys, spelled the way the song's own key is (major keys for a major song, minor keys for a minor one). */
function keyChoices(songKey: string): string[] {
  return Array.from({ length: 12 }, (_, i) => transposeKey(songKey, i));
}

export default function ListView({ kind, id, title, serviceDate, rows: initialRows, languageNames, genreLabels, scope = null }: Props) {
  const router = useRouter();
  const player = usePlayer();
  const [rows, setRows] = useState(initialRows);
  const [shownName, setShownName] = useState(title);
  const [shownDate, setShownDate] = useState(serviceDate);
  const [name, setName] = useState(title);
  const [date, setDate] = useState(serviceDate ?? '');
  const [editing, setEditing] = useState(false);
  const [find, setFind] = useState('');
  const [sort, setSort] = useState<SortMode>('custom');
  const [chips, setChips] = useState<ChipSelection>(NO_CHIPS);
  const [sortOpen, setSortOpen] = useState(false);
  const [status, setStatus] = useState<Status>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const editable = kind !== 'liked' && id !== null;
  const isSetlist = kind === 'setlist';

  const slots = useMemo(() => rows.map((r) => ({ id: r.item_id, song: r.song, row: r })), [rows]);
  const songs = useMemo(() => rows.flatMap((r) => (r.song ? [r.song] : [])), [rows]);
  const chipList = useMemo(() => listChips(songs, (c) => languageNames[c] ?? c, (c) => genreLabels[c] ?? c), [songs, languageNames, genreLabels]);

  // Editing always shows the whole list in its own order: moving a song only makes sense there.
  const mode: SortMode = editing ? 'custom' : sort;
  const shown = visibleSlots(slots, editing ? '' : find, editing ? NO_CHIPS : chips, mode);
  const shownSongs = shown.flatMap((s) => (s.song ? [s.song] : []));
  const firstPlayable = shownSongs.find((s) => s.has_audio);
  const filtering = !editing && isFiltering(find, chips);
  const here = player.source === shownName && player.current !== null && songs.some((s) => s.id === player.current?.id);
  const busy = here && player.playing;

  function play() {
    if (here) player.toggle();
    else if (player.shuffle) player.shuffleAll(shownSongs, shownName);
    else if (firstPlayable) player.playQueue(shownSongs, firstPlayable.id, shownName);
  }

  async function move(index: number, delta: -1 | 1) {
    if (!id) return;
    const target = index + delta;
    if (target < 0 || target >= rows.length) return;
    const next = rows.slice();
    [next[index], next[target]] = [next[target], next[index]];
    const before = rows;
    setRows(next);
    setStatus(null);
    const { error } = await createClient().rpc('reorder_playlist', { p_playlist: id, p_item_ids: next.map((r) => r.item_id) });
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
    if (!id) return;
    setStatus(null);
    const { error } = await createClient()
      .from('playlists')
      .update({ name: name.trim(), service_date: isSetlist && date ? date : null })
      .eq('id', id);
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
    if (!id) return;
    const { error } = await createClient().from('playlists').delete().eq('id', id);
    if (error) {
      setStatus({ ok: false, text: 'Could not delete the list. Please try again.' });
      setConfirmDelete(false);
    } else {
      router.push('/library');
      router.refresh();
    }
  }

  const countText = `${isSetlist ? `Setlist${shownDate ? ` · ${shownDate}` : ''} · ` : ''}${songCountLabel(rows.length)}${scope ? ` · ${scope.label}` : ''}`;
  const sortLabels: Record<SortMode, string> = {
    custom: kind === 'liked' ? 'Recently liked' : 'Order in the list',
    title: 'Title',
    artist: 'Artist',
    newest: 'Newest first',
  };

  function songSub(song: Song, keyOverride: string | null): string | undefined {
    const key = isSetlist ? keyOverride ?? song.musical_key : null;
    return key ? `${song.artist_name} · Key ${key}` : undefined;
  }

  return (
    <div className="list-screen">
      <article className="list-inner">
        <header className="list-top">
          <Link href="/library" className="round-back" aria-label="Back to Library">
            <ChevronLeftIcon size={20} />
          </Link>
          <span className="list-top-gap" />
          {editable && songs.length > 0 && id ? (
            <Link href={`/stage/setlist/${id}`} className="round-back" aria-label="Stage mode">
              <StageIcon size={20} />
            </Link>
          ) : null}
          {editable ? (
            <button type="button" className="pill-btn list-edit" aria-label={editing ? 'Done editing' : 'Edit list'} onClick={() => { setEditing((v) => !v); setStatus(null); setConfirmDelete(false); }}>
              {editing ? 'Done' : 'Edit'}
            </button>
          ) : null}
        </header>

        {editing ? (
          <section className="edit-panel" aria-label="Edit this list">
            <form onSubmit={saveDetails}>
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
            <div className="edit-delete">
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
          </section>
        ) : (
          <div className="list-tools">
            <div role="search" className="find-field">
              <SearchIcon size={18} />
              <input type="search" value={find} onChange={(e) => setFind(e.target.value)} placeholder={`Find in ${shownName}`} aria-label={`Find in ${shownName}`} autoComplete="off" />
            </div>
            <button type="button" className="sort-btn" aria-haspopup="dialog" onClick={() => setSortOpen(true)}>Sort</button>
          </div>
        )}

        <div className="list-title">
          <h1>{shownName}</h1>
          <p className="list-count">{countText}</p>
          {scope ? <Link href={scope.clearHref} className="inline list-scope">All liked songs</Link> : null}
        </div>

        {editing ? null : (
          <div className="list-actions">
            <span className="list-tile" style={kind === 'liked' ? undefined : { background: '#262626', color: '#b3b3b3' }} aria-hidden="true">
              {kind === 'liked' ? <HeartIcon size={18} filled /> : <ListIcon size={18} />}
            </span>
            <span className="artist-actions-gap" />
            {firstPlayable || here ? (
              <>
                <button type="button" className="row-ic ctl-ic" aria-label="Shuffle" aria-pressed={player.shuffle} onClick={player.toggleShuffle}>
                  <ShuffleIcon />
                </button>
                <button type="button" className="round-play round-play-md" aria-label={busy ? `Pause ${shownName}` : `Play ${shownName}`} onClick={play}>
                  {busy ? <PauseIcon size={22} /> : <PlayIcon size={22} />}
                </button>
              </>
            ) : null}
          </div>
        )}

        {!editing && chipList.length > 1 ? (
          <div className="chip-row chip-scroll" role="group" aria-label="Filter this list">
            {chipList.map((c) => (
              <button
                key={c.key}
                type="button"
                className="chip"
                aria-pressed={chips[c.kind].includes(c.code)}
                onClick={() => setChips((cur) => toggleChip(cur, c))}
              >
                {c.label}
              </button>
            ))}
          </div>
        ) : null}

        {status ? <p className={status.ok ? 'ok' : 'error'} role={status.ok ? 'status' : 'alert'}>{status.text}</p> : null}

        {rows.length === 0 ? (
          <div className="card empty list-empty">
            {kind === 'liked' ? (
              <p>Songs you like appear here.</p>
            ) : (
              <>
                <p>No songs yet. Open a song and choose &ldquo;Add to list&rdquo;.</p>
                <Link href="/search" className="btn btn-primary">Search for songs</Link>
              </>
            )}
          </div>
        ) : editing ? (
          <ol className="song-list plain-list" aria-label="Songs in this list">
            {rows.map((r, i) => {
              const song = r.song;
              const label = song ? song.title : `slot ${i + 1}`;
              return (
                <li key={r.item_id} className="song-row">
                  <span className="slot-no" aria-hidden="true">{i + 1}</span>
                  {song ? (
                    <span className="song-main">
                      <span className="song-title">{song.title}</span>
                      <span className="song-artist">{song.artist_name}</span>
                    </span>
                  ) : (
                    <span className="song-main">
                      <span className="song-title muted">Not available right now</span>
                      <span className="song-artist">This slot keeps its place.</span>
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
        ) : (
          <div className="song-list">
            <Link href="/search" className="add-row">
              <span className="add-tile" aria-hidden="true"><PlusIcon size={20} /></span>
              <span className="add-text">Add songs</span>
            </Link>
            {shown.map((s) =>
              s.song ? (
                <SongRow key={s.id} song={s.song} songs={shownSongs} source={shownName} sub={songSub(s.song, s.row.key_override)} />
              ) : (
                <div key={s.id} className="song-row">
                  <span className="song-main">
                    <span className="song-title muted">Not available right now</span>
                    <span className="song-artist">This slot keeps its place.</span>
                  </span>
                </div>
              ),
            )}
            {filtering && shown.length === 0 ? <p className="list-none muted">No songs match.</p> : null}
          </div>
        )}
      </article>

      {sortOpen ? (
        <Sheet label="Sort" onClose={() => setSortOpen(false)}>
          <div className="sheet-head">
            <div className="sheet-head-text">
              <div className="sheet-title">Sort by</div>
            </div>
          </div>
          <ul className="plain-list sheet-list">
            {SORT_MODES.map((m) => (
              <li key={m}>
                <button type="button" className="sheet-item" aria-pressed={sort === m} onClick={() => { setSort(m); setSortOpen(false); }}>
                  <span className="sheet-item-text">{sortLabels[m]}</span>
                  {sort === m ? <CheckIcon /> : null}
                </button>
              </li>
            ))}
          </ul>
        </Sheet>
      ) : null}
    </div>
  );
}
