'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { parseChordPro, prefersFlats, transposeKey, transposeLines } from '@/lib/chordpro';
import { buildShareUrl, shareMessage, type ShareKind } from '@/lib/share';
import LyricsBody from '@/components/LyricsBody';
import { useLikes } from '@/components/LikesProvider';
import { createClient } from '@/lib/supabase/client';
import type { LyricsVersion, Song } from '@/lib/types';
import AddToList from './AddToList';
import PlayerPanel from './PlayerPanel';

const VERSION_LABEL: Record<LyricsVersion['version'], string> = {
  original: 'Original',
  romanized: 'Romanized',
  meaning: 'Meaning',
};

type Props = {
  song: Song;
  /** The songs that play after this one when it is started from this page. */
  queue: Song[];
  lyrics: LyricsVersion[];
  userId: string;
  lyricsFailed: boolean;
};

export default function SongView({ song, queue, lyrics, userId, lyricsFailed }: Props) {
  const [versionIdx, setVersionIdx] = useState(0);
  const [semitones, setSemitones] = useState(0);
  const [showChords, setShowChords] = useState(true);
  const [size, setSize] = useState(1.05);
  const likes = useLikes();
  const liked = likes.isLiked(song.id);
  const [status, setStatus] = useState<string | null>(null);

  const current = lyrics[versionIdx] ?? lyrics[0];

  // Counts one "lyrics opened" event per 30 minutes per user; the database does the de-duplication.
  useEffect(() => {
    if (lyrics.length === 0) return;
    void createClient().rpc('record_play', { p_song: song.id, p_kind: 'lyrics_open' });
  }, [song.id, lyrics.length]);

  const targetKey = song.musical_key ? transposeKey(song.musical_key, semitones) : null;
  const preferFlat = targetKey ? prefersFlats(targetKey) : false;

  const lines = useMemo(() => {
    if (!current) return [];
    const parsed = parseChordPro(current.body);
    return transposeLines(parsed.lines, semitones, preferFlat);
  }, [current, semitones, preferFlat]);

  const chordsAvailable = Boolean(current?.has_chords);
  const chordsOn = chordsAvailable && showChords;

  async function toggleLike() {
    const problem = await likes.toggle(song.id);
    if (problem) setStatus(problem);
  }

  async function share(kind: ShareKind) {
    const origin = process.env.NEXT_PUBLIC_SITE_URL || window.location.origin;
    const url = buildShareUrl(kind, song.slug, origin);
    try {
      if (navigator.share) {
        await navigator.share({ title: song.title, text: shareMessage(song.title, url), url });
      } else {
        await navigator.clipboard.writeText(url);
        setStatus('Link copied.');
      }
    } catch {
      // The person closed the share sheet, or clipboard access was refused. Nothing to report.
    }
  }

  return (
    <article>
      <div className="song-head section">
        <h1>{song.title}</h1>
        <p className="muted" style={{ margin: '4px 0 0' }}>
          <Link href={`/artist/${song.artist_slug}`} className="inline">{song.artist_name}</Link>
          {song.album_title && song.album_slug ? (
            <>
              {' · '}
              <Link href={`/album/${song.album_slug}`} className="inline">{song.album_title}</Link>
            </>
          ) : null}
        </p>
      </div>

      <PlayerPanel song={song} queue={queue} />

      <div className="toolbar">
        <button type="button" className="btn" onClick={toggleLike} aria-pressed={liked}>
          {liked ? '♥ Liked' : '♡ Like'}
        </button>
        <button type="button" className="btn" onClick={() => share('app')}>Share app link</button>
        <button type="button" className="btn" onClick={() => share('web')}>Share web link</button>
        <Link href={`/stage/song/${song.slug}`} className="btn">Stage mode</Link>
      </div>
      <AddToList songId={song.id} userId={userId} />
      {status ? <p className="notice" role="status">{status}</p> : null}

      {lyricsFailed ? (
        <p className="error" role="alert">Lyrics could not be loaded. Please refresh in a moment.</p>
      ) : lyrics.length === 0 ? (
        <div className="card empty">Lyrics are not available for this song.</div>
      ) : (
        <>
          {lyrics.length > 1 ? (
            <div className="tabs" role="group" aria-label="Lyrics version">
              {lyrics.map((l, i) => (
                <button key={l.version} type="button" className="tab" aria-pressed={i === versionIdx} onClick={() => setVersionIdx(i)}>
                  {VERSION_LABEL[l.version]}
                </button>
              ))}
            </div>
          ) : null}

          <div className="toolbar">
            {chordsAvailable ? (
              <>
                <div className="stepper" role="group" aria-label="Transpose">
                  <button type="button" onClick={() => setSemitones((s) => Math.max(-6, s - 1))} aria-label="Down one semitone">−</button>
                  <span>{targetKey ? `Key ${targetKey}` : semitones === 0 ? 'Original' : `${semitones > 0 ? '+' : ''}${semitones}`}</span>
                  <button type="button" onClick={() => setSemitones((s) => Math.min(6, s + 1))} aria-label="Up one semitone">+</button>
                </div>
                {semitones !== 0 ? (
                  <button type="button" className="btn btn-ghost" onClick={() => setSemitones(0)}>Reset</button>
                ) : null}
                <button type="button" className="btn" aria-pressed={showChords} onClick={() => setShowChords((v) => !v)}>
                  {showChords ? 'Hide chords' : 'Show chords'}
                </button>
              </>
            ) : null}
            <div className="stepper" role="group" aria-label="Text size">
              <button type="button" onClick={() => setSize((v) => Math.max(0.85, +(v - 0.1).toFixed(2)))} aria-label="Smaller text">A−</button>
              <span>Size</span>
              <button type="button" onClick={() => setSize((v) => Math.min(2, +(v + 0.1).toFixed(2)))} aria-label="Larger text">A+</button>
            </div>
          </div>

          <LyricsBody lines={lines} chordsOn={chordsOn} sizeRem={size} />
        </>
      )}
    </article>
  );
}
