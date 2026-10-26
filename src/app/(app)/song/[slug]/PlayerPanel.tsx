'use client';

import { PauseIcon, PlayIcon } from '@/components/icons';
import { usePlayer } from '@/components/player/PlayerProvider';
import SeekBar from '@/components/player/SeekBar';
import YouTubeLink from '@/components/player/YouTubeLink';
import type { Song } from '@/lib/types';

/** Listen controls at the top of a song page: play the hosted audio and, when there is one, jump out to YouTube. */
export default function PlayerPanel({ song, queue }: { song: Song; queue: Song[] }) {
  const p = usePlayer();
  const isCurrent = p.current?.id === song.id;
  const busy = isCurrent && p.playing;

  if (!song.has_audio && !song.youtube_id) return null;

  return (
    <section className="panel" aria-label="Listen">
      {song.has_audio ? (
        <div className="panel-row">
          <button
            type="button"
            className="round-play round-play-lg"
            aria-label={busy ? `Pause ${song.title}` : `Play ${song.title}`}
            onClick={() => (isCurrent ? p.toggle() : p.playQueue(queue, song.id))}
          >
            {busy ? <PauseIcon size={28} /> : <PlayIcon size={28} />}
          </button>
          <SeekBar className="panel-seek" active={isCurrent} idleDuration={song.duration_s ?? 0} />
        </div>
      ) : (
        <p className="small muted" style={{ margin: 0 }}>No audio file for this song yet. Lyrics only.</p>
      )}
      {isCurrent && p.error ? <p className="error" role="alert">{p.error}</p> : null}
      {song.youtube_id ? (
        <div className="panel-links">
          <YouTubeLink youtubeId={song.youtube_id} />
        </div>
      ) : null}
    </section>
  );
}
