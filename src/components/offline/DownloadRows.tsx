'use client';

// The saved songs as rows: cover, title, what is kept (size, or "Lyrics only"), then Lyrics, Play and Remove.
// Used on the Downloads page in Settings and on the offline page.

import { sizeLabel } from '@/lib/audio-file';
import type { OfflineSongRecord } from '@/lib/offline/store';
import Cover from '../Cover';
import { CloseIcon, LyricsIcon, PauseIcon, PlayIcon } from '../icons';

export type DownloadRowsProps = {
  records: OfflineSongRecord[];
  playingId: string | null;
  playing: boolean;
  onPlay: (record: OfflineSongRecord) => void;
  onLyrics: (record: OfflineSongRecord) => void;
  onRemove: (record: OfflineSongRecord) => void;
};

/** What is kept for a song, in a few words. */
export function keptLabel(record: Pick<OfflineSongRecord, 'audioPath' | 'audioBytes' | 'lyrics'>): string {
  if (record.audioPath === null) return 'Lyrics only';
  return record.lyrics.length > 0 ? `${sizeLabel(record.audioBytes)} · with lyrics` : sizeLabel(record.audioBytes);
}

export default function DownloadRows({ records, playingId, playing, onPlay, onLyrics, onRemove }: DownloadRowsProps) {
  return (
    <div className="song-list dl-list">
      {records.map((r) => {
        const isCurrent = playingId === r.songId;
        const busy = isCurrent && playing;
        const hasAudio = r.audioPath !== null;
        return (
          <div key={r.songId} className={`song-row${isCurrent ? ' song-row-current' : ''}`}>
            <span className="song-cover">
              <Cover url={r.song.cover_url} name={r.song.title} size={40} />
            </span>
            <div className="song-main">
              <span className="song-title">{r.song.title}</span>
              <span className="song-artist">{r.song.artist_name} · {keptLabel(r)}</span>
            </div>
            <div className="row-actions">
              {r.lyrics.length > 0 ? (
                <button type="button" className={`row-ic${hasAudio ? '' : ' row-ic-hot'}`} aria-label={`Lyrics of ${r.song.title}`} onClick={() => onLyrics(r)}>
                  <LyricsIcon />
                </button>
              ) : null}
              {hasAudio ? (
                <button type="button" className="round-play" aria-label={busy ? `Pause ${r.song.title}` : `Play ${r.song.title}`} onClick={() => onPlay(r)}>
                  {busy ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
                </button>
              ) : (
                <span className="round-play-gap" aria-hidden="true" />
              )}
              <button type="button" className="row-ic" aria-label={`Remove download of ${r.song.title}`} onClick={() => onRemove(r)}>
                <CloseIcon size={20} />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
