'use client';

import Link from 'next/link';
import Cover from '../Cover';
import { HeartIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon } from '../icons';
import { useLikes } from '../LikesProvider';
import { useSongMenu } from '../SongMenu';
import { usePlayback, usePlayer } from './PlayerProvider';
import SeekBar from './SeekBar';
import YouTubeLink from './YouTubeLink';

/** The strip that stays on every page while a song is loaded. Tapping the song opens its page, with the lyrics. */
export default function MiniPlayer() {
  const p = usePlayer();
  const likes = useLikes();
  const menu = useSongMenu();
  const { position, duration } = usePlayback();
  const song = p.current;
  if (!song) return null;
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;
  const liked = likes.isLiked(song.id);

  return (
    <section className="mini" aria-label="Player">
      <div className="mini-progress" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      <Link href={`/song/${song.slug}`} className="mini-info">
        <Cover url={song.cover_url} name={song.title} size={40} />
        <span className="mini-text">
          <span className="mini-title">{song.title}</span>
          {p.error ? <span className="mini-error" role="alert">{p.error}</span> : <span className="mini-artist">{song.artist_name}</span>}
        </span>
      </Link>
      <div className="mini-controls">
        <button type="button" className="icon-btn mini-prev" onClick={p.previous} aria-label="Previous">
          <PrevIcon />
        </button>
        <button type="button" className="round-play" onClick={p.toggle} aria-label={p.playing ? 'Pause' : 'Play'}>
          {p.playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
        </button>
        <button type="button" className="icon-btn" onClick={p.next} disabled={!p.hasNext} aria-label="Next">
          <NextIcon />
        </button>
      </div>
      <div className="mini-seek">
        <SeekBar />
      </div>
      <div className="mini-extra">
        <button
          type="button"
          className="row-ic row-like"
          aria-pressed={liked}
          aria-label={liked ? `Unlike ${song.title}` : `Like ${song.title}`}
          onClick={() => void likes.toggle(song.id).then((problem) => problem && menu.notify(problem))}
        >
          <HeartIcon filled={liked} />
        </button>
        {song.youtube_id ? (
          <span className="mini-yt">
            <YouTubeLink youtubeId={song.youtube_id} compact />
          </span>
        ) : null}
      </div>
    </section>
  );
}
