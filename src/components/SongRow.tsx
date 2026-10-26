'use client';

import Link from 'next/link';
import type { Song } from '@/lib/types';
import { PauseIcon, PlayIcon } from './icons';
import { usePlayer } from './player/PlayerProvider';

/** One song in a list: a play button (only when the song has an audio file) and a link to its page with the lyrics.
 *  Playing starts a queue made of the playable songs of the whole list, so Next moves down the list. */
export function SongRow({ song, songs }: { song: Song; songs: Song[] }) {
  const player = usePlayer();
  const isCurrent = player.current?.id === song.id;
  const busy = isCurrent && player.playing;

  return (
    <div className={`song-row${isCurrent ? ' song-row-current' : ''}`}>
      {song.has_audio ? (
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
      <Link href={`/song/${song.slug}`} className="song-main">
        <span className="song-title">{song.title}</span>
        <span className="small muted">
          {song.artist_name}
          {song.album_title ? ` · ${song.album_title}` : ''}
        </span>
      </Link>
      <div className="song-meta">
        {song.has_audio ? null : <span className="pill pill-quiet">Lyrics</span>}
        {song.musical_key ? <span className="pill">{song.musical_key}</span> : null}
        <span className="small muted">{song.language_code}</span>
      </div>
    </div>
  );
}

export default function SongList({ songs }: { songs: Song[] }) {
  return (
    <div className="song-list">
      {songs.map((s) => (
        <SongRow key={s.id} song={s} songs={songs} />
      ))}
    </div>
  );
}
