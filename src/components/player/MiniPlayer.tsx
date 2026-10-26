'use client';

import Link from 'next/link';
import { NextIcon, PauseIcon, PlayIcon, PrevIcon } from '../icons';
import { usePlayback, usePlayer } from './PlayerProvider';
import SeekBar from './SeekBar';
import YouTubeLink from './YouTubeLink';

/** The bar that stays on every page while a song is loaded. Tapping the song opens its page, with the lyrics. */
export default function MiniPlayer() {
  const p = usePlayer();
  const { position, duration } = usePlayback();
  const song = p.current;
  if (!song) return null;
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <section className="mini" aria-label="Player">
      <div className="mini-progress" aria-hidden="true">
        <span style={{ width: `${pct}%` }} />
      </div>
      <Link href={`/song/${song.slug}`} className="mini-info">
        <span className="mini-art" aria-hidden="true">{song.title.trim().charAt(0).toUpperCase()}</span>
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
          {p.playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <button type="button" className="icon-btn" onClick={p.next} disabled={!p.hasNext} aria-label="Next">
          <NextIcon />
        </button>
      </div>
      <div className="mini-seek">
        <SeekBar />
      </div>
      <div className="mini-extra">{song.youtube_id ? <YouTubeLink youtubeId={song.youtube_id} compact /> : null}</div>
    </section>
  );
}
