'use client';

import Link from 'next/link';
import type { Song } from '@/lib/types';
import Cover from './Cover';
import { HeartIcon, LyricsIcon, MoreIcon, PauseIcon, PlayIcon } from './icons';
import { useLikes } from './LikesProvider';
import { usePlayer } from './player/PlayerProvider';
import { useSongMenu } from './SongMenu';

/** The page a song's title opens: the player when there is audio, the lyrics when there is not. */
export function songHref(song: Pick<Song, 'slug'>): string {
  return `/song/${song.slug}`;
}

/** The lyrics on their own, without starting the song. */
export function lyricsHref(song: Pick<Song, 'slug'>): string {
  return `/song/${song.slug}/lyrics`;
}

/** One song in a list: cover with its language, title and artist, then Lyrics, Like, Play and the ⋮ menu.
 *  There is no Play button for a song without an audio file. Playing starts a queue made of the playable songs of
 *  the whole list, so Next moves down the list. `source` names the list in the player ("Playing from …"). */
export function SongRow({ song, songs, source }: { song: Song; songs: Song[]; source?: string }) {
  const player = usePlayer();
  const likes = useLikes();
  const menu = useSongMenu();
  const isCurrent = player.current?.id === song.id;
  const busy = isCurrent && player.playing;
  const liked = likes.isLiked(song.id);

  async function toggleLike() {
    const problem = await likes.toggle(song.id);
    if (problem) menu.notify(problem);
  }

  return (
    <div className={`song-row${isCurrent ? ' song-row-current' : ''}`}>
      <Link href={songHref(song)} className="song-cover" tabIndex={-1} aria-hidden="true">
        <Cover url={null} name={song.title} size={40} />
        <span className="lang-tag">{song.language_code}</span>
      </Link>
      <Link href={songHref(song)} className="song-main">
        <span className="song-title">{song.title}</span>
        <span className="song-artist">{song.artist_name}</span>
      </Link>
      <div className="row-actions">
        <Link href={lyricsHref(song)} className="row-ic" aria-label={`Lyrics of ${song.title}`}>
          <LyricsIcon />
        </Link>
        <button type="button" className="row-ic row-like" aria-pressed={liked} aria-label={liked ? `Unlike ${song.title}` : `Like ${song.title}`} onClick={() => void toggleLike()}>
          <HeartIcon filled={liked} />
        </button>
        {song.has_audio ? (
          <button
            type="button"
            className="round-play"
            aria-label={busy ? `Pause ${song.title}` : `Play ${song.title}`}
            onClick={() => (isCurrent ? player.toggle() : player.playQueue(songs, song.id, source))}
          >
            {busy ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
          </button>
        ) : (
          <span className="round-play-gap" aria-hidden="true" />
        )}
        <button type="button" className="row-ic" aria-label={`More options for ${song.title}`} onClick={() => menu.openSongMenu(song)}>
          <MoreIcon />
        </button>
      </div>
    </div>
  );
}

export default function SongList({ songs, source }: { songs: Song[]; source?: string }) {
  return (
    <div className="song-list">
      {songs.map((s) => (
        <SongRow key={s.id} song={s} songs={songs} source={source} />
      ))}
    </div>
  );
}
