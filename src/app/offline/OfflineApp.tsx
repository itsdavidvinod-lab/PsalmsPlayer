'use client';

// The downloads, on their own page, for when there is no connection. Nothing here asks the server for anything: the songs, their lyrics
// and their recordings all come from the phone's storage, and the player is the same one the rest of the app uses.
// When a connection is back it says so and offers the way into the full app.

import { useEffect, useMemo, useState } from 'react';
import Cover from '@/components/Cover';
import DownloadRows from '@/components/offline/DownloadRows';
import { OfflineProvider, useOffline } from '@/components/offline/OfflineProvider';
import { ChevronDownIcon, MoreIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, RepeatIcon, ShuffleIcon } from '@/components/icons';
import LyricOptions from '@/components/LyricOptions';
import LyricsBody from '@/components/LyricsBody';
import { PlayerProvider, usePlayer } from '@/components/player/PlayerProvider';
import SeekBar from '@/components/player/SeekBar';
import Sheet from '@/components/Sheet';
import { parseChordPro, prefersFlats, transposeKey, transposeLines } from '@/lib/chordpro';
import type { OfflineSongRecord } from '@/lib/offline/store';
import type { Song } from '@/lib/types';

const SIZE_KEY = 'psalms:lyric-size';
const SIZE_DEFAULT = 1.05;
const SIZE_MIN = 0.85;
const SIZE_MAX = 2;

export default function OfflineApp() {
  return (
    <PlayerProvider>
      <OfflineProvider>
        <OfflineScreen />
      </OfflineProvider>
    </PlayerProvider>
  );
}

function useOnline(): boolean {
  const [online, setOnline] = useState(true);
  useEffect(() => {
    setOnline(navigator.onLine);
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

function OfflineScreen() {
  const offline = useOffline();
  const p = usePlayer();
  const online = useOnline();
  const [mounted, setMounted] = useState(false);
  const [readingId, setReadingId] = useState<string | null>(null);
  useEffect(() => setMounted(true), []);

  const queue: Song[] = useMemo(() => offline.records.filter((r) => r.audioPath !== null).map((r) => r.song), [offline.records]);
  const reading = offline.records.find((r) => r.songId === readingId) ?? null;

  // While a song's page is open, it follows the music: when the next song starts, its page opens.
  const playingId = p.current?.id ?? null;
  useEffect(() => {
    if (readingId !== null && playingId !== null && playingId !== readingId && offline.records.some((r) => r.songId === playingId)) setReadingId(playingId);
    // Only a change of the playing song moves the page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playingId]);

  // A song that was removed while its page was open: back to the list.
  useEffect(() => {
    if (readingId !== null && offline.ready && !reading) setReadingId(null);
  }, [readingId, reading, offline.ready]);

  if (reading) {
    return <Reader record={reading} queue={queue} onClose={() => setReadingId(null)} />;
  }

  const playingRecord = offline.records.find((r) => r.songId === playingId) ?? null;

  return (
    <main className="offline-page">
      <h1>Downloads</h1>
      <div className="offline-status">
        <span className={online ? 'pill' : 'pill pill-gold'} role="status">{online ? 'Back online' : 'Offline'}</span>
        {online ? null : <span className="small muted">Your downloaded songs still play.</span>}
      </div>
      {online ? (
        <p style={{ margin: '0 0 14px' }}>
          <a href="/" className="btn btn-primary btn-block">Open PsalmsPlayer</a>
        </p>
      ) : null}

      {!mounted ? null : !offline.enabled ? (
        <p className="card empty">Downloads are available in the PsalmsPlayer Android app.</p>
      ) : !offline.ready ? null : offline.records.length === 0 ? (
        <div className="card empty">
          Nothing is saved on this phone. When you are online, open the ⋮ menu of a song and choose <strong>Download for offline</strong>.
        </div>
      ) : (
        <DownloadRows
          records={offline.records}
          playingId={playingId}
          playing={p.playing}
          onPlay={(r) => (p.current?.id === r.songId ? p.toggle() : p.playQueue(queue, r.songId, 'Downloads'))}
          onLyrics={(r) => setReadingId(r.songId)}
          onRemove={(r) => void offline.remove(r.songId)}
        />
      )}

      {playingRecord ? (
        <section className="offline-mini" aria-label="Player">
          <button type="button" className="offline-mini-info" onClick={() => setReadingId(playingRecord.songId)} aria-label={`Open ${playingRecord.song.title}`}>
            <Cover url={playingRecord.song.cover_url} name={playingRecord.song.title} size={40} />
            <span className="mini-text">
              <span className="mini-title">{playingRecord.song.title}</span>
              {p.error ? <span className="mini-error" role="alert">{p.error}</span> : <span className="mini-artist">{playingRecord.song.artist_name}</span>}
            </span>
          </button>
          <button type="button" className="round-play" onClick={p.toggle} aria-label={p.playing ? 'Pause' : 'Play'}>
            {p.playing ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
          </button>
          <button type="button" className="icon-btn" onClick={p.next} disabled={!p.hasNext} aria-label="Next">
            <NextIcon />
          </button>
        </section>
      ) : null}
    </main>
  );
}

/** One saved song, full screen: its lyrics (with chords when kept) and, when a recording is saved, the controls. */
function Reader({ record, queue, onClose }: { record: OfflineSongRecord; queue: Song[]; onClose: () => void }) {
  const p = usePlayer();
  const song = record.song;
  const hasAudio = record.audioPath !== null;
  const isCurrent = p.current?.id === song.id;
  const busy = isCurrent && p.playing;

  const [versionIdx, setVersionIdx] = useState(0);
  const [semitones, setSemitones] = useState(0);
  const [showChords, setShowChords] = useState(true);
  const [size, setSize] = useState(SIZE_DEFAULT);
  const [options, setOptions] = useState(false);

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(SIZE_KEY));
      if (saved >= SIZE_MIN && saved <= SIZE_MAX) setSize(saved);
    } catch {
      // Blocked storage: the default size is used.
    }
  }, []);
  function changeSize(next: number) {
    const clamped = Math.min(SIZE_MAX, Math.max(SIZE_MIN, +next.toFixed(2)));
    setSize(clamped);
    try {
      window.localStorage.setItem(SIZE_KEY, String(clamped));
    } catch {
      // Not remembered; the size still changes now.
    }
  }

  const current = record.lyrics[versionIdx] ?? record.lyrics[0];
  const targetKey = song.musical_key ? transposeKey(song.musical_key, semitones) : null;
  const preferFlat = targetKey ? prefersFlats(targetKey) : false;
  const lines = useMemo(() => (current ? transposeLines(parseChordPro(current.body).lines, semitones, preferFlat) : []), [current, semitones, preferFlat]);
  const chordsAvailable = Boolean(current?.has_chords);

  const lyricsPanel =
    record.lyrics.length === 0 ? (
      <div className="card empty">Lyrics are not saved for this song.</div>
    ) : (
      <LyricsBody lines={lines} chordsOn={chordsAvailable && showChords} sizeRem={size} className="lyrics lyrics-panel" />
    );

  return (
    <article className="screen screen-player">
      <header className="screen-bar">
        <button type="button" className="icon-btn" aria-label="Back to downloads" onClick={onClose}>
          <ChevronDownIcon />
        </button>
        <div className="screen-bar-text">
          <span className="screen-eyebrow">Downloaded</span>
          <span className="screen-source">{song.album_title ?? song.artist_name}</span>
        </div>
        <button type="button" className="icon-btn" aria-label={`Reading options for ${song.title}`} onClick={() => setOptions(true)}>
          <MoreIcon size={22} />
        </button>
      </header>
      <h1 className="sr-only">{song.title}</h1>

      <div className="lyrics-scroll">{lyricsPanel}</div>

      <section className="dock" aria-label="Listen">
        <div className="dock-top">
          <Cover url={song.cover_url} name={song.title} size={52} />
          <div className="dock-text">
            <div className="dock-title">{song.title}</div>
            <span className="dock-artist">{song.artist_name}</span>
          </div>
        </div>
        {hasAudio ? (
          <>
            <SeekBar className="dock-seek" active={isCurrent} idleDuration={song.duration_s ?? 0} />
            <div className="dock-controls">
              <button type="button" className="row-ic" aria-label="Shuffle" aria-pressed={p.shuffle} onClick={p.toggleShuffle}>
                <ShuffleIcon />
              </button>
              <button type="button" className="icon-btn" aria-label="Previous" disabled={!isCurrent} onClick={p.previous}>
                <PrevIcon size={26} />
              </button>
              <button
                type="button"
                className="round-play round-play-lg"
                aria-label={busy ? `Pause ${song.title}` : `Play ${song.title}`}
                onClick={() => (isCurrent ? p.toggle() : p.playQueue(queue, song.id, 'Downloads'))}
              >
                {busy ? <PauseIcon size={30} /> : <PlayIcon size={30} />}
              </button>
              <button type="button" className="icon-btn" aria-label="Next" disabled={!isCurrent || !p.hasNext} onClick={p.next}>
                <NextIcon size={26} />
              </button>
              <button type="button" className="row-ic" aria-label={`Repeat ${p.repeat}`} aria-pressed={p.repeat !== 'off'} onClick={p.cycleRepeat}>
                <RepeatIcon one={p.repeat === 'one'} />
              </button>
            </div>
            {isCurrent && p.error ? <p className="error" role="alert">{p.error}</p> : null}
          </>
        ) : (
          <p className="small muted" style={{ margin: '8px 0 0' }}>Lyrics only: no recording is saved for this song.</p>
        )}
      </section>

      {options ? (
        <Sheet label={`Reading options for ${song.title}`} onClose={() => setOptions(false)}>
          <LyricOptions
            versions={record.lyrics.map((l) => l.version)}
            versionIdx={versionIdx}
            onVersion={setVersionIdx}
            chordsAvailable={chordsAvailable}
            showChords={showChords}
            onShowChords={setShowChords}
            semitones={semitones}
            keyLabel={targetKey}
            onSemitones={setSemitones}
            sizePercent={Math.round((size / SIZE_DEFAULT) * 100)}
            onSmaller={() => changeSize(size - 0.1)}
            onLarger={() => changeSize(size + 0.1)}
          />
        </Sheet>
      ) : null}
    </article>
  );
}
