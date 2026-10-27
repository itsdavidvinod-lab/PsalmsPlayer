'use client';

// A song, full screen. Two layouts:
//   player  The lyrics, with the controls at the bottom (a song that has an audio file, opened from a list, the strip or a link).
//   lyrics  The lyrics on their own: title, who sings it, and Like / Share / Add to list. Used for a song without audio, and
//           for the Lyrics icon of a row. Whatever is playing keeps playing, and the strip stays at the bottom.
// The ⋮ menu holds the reading options (version, size, chords, key) above the usual song actions.

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import AddToListPanel from '@/components/AddToListPanel';
import Cover from '@/components/Cover';
import { ChevronDownIcon, HeartIcon, MoreIcon, NextIcon, PauseIcon, PlayIcon, PrevIcon, RepeatIcon, ShareIcon, ListPlusIcon, ShuffleIcon } from '@/components/icons';
import { useLikes } from '@/components/LikesProvider';
import LyricsBody from '@/components/LyricsBody';
import { usePlayer } from '@/components/player/PlayerProvider';
import SeekBar from '@/components/player/SeekBar';
import { shareSong } from '@/components/share-client';
import Sheet from '@/components/Sheet';
import { SongMenuBody, useSongMenu } from '@/components/SongMenu';
import { parseChordPro, prefersFlats, transposeKey, transposeLines } from '@/lib/chordpro';
import { createClient } from '@/lib/supabase/client';
import type { LyricsVersion, Song } from '@/lib/types';
import LyricOptions from './LyricOptions';

export type SongScreenMode = 'player' | 'lyrics';

type Props = {
  song: Song;
  queue: Song[];
  lyrics: LyricsVersion[];
  lyricsFailed: boolean;
  languageName: string;
  userId: string;
  mode: SongScreenMode;
};

const SIZE_KEY = 'psalms:lyric-size';
const SIZE_DEFAULT = 1.05;
const SIZE_MIN = 0.85;
const SIZE_MAX = 2;

export default function SongScreen({ song, queue, lyrics, lyricsFailed, languageName, userId, mode }: Props) {
  const router = useRouter();
  const p = usePlayer();
  const likes = useLikes();
  const menu = useSongMenu();

  const [versionIdx, setVersionIdx] = useState(0);
  const [semitones, setSemitones] = useState(0);
  const [showChords, setShowChords] = useState(true);
  const [size, setSize] = useState(SIZE_DEFAULT);
  const [sheet, setSheet] = useState<'menu' | 'add' | null>(null);

  const isCurrent = p.current?.id === song.id;
  const busy = isCurrent && p.playing;
  const liked = likes.isLiked(song.id);
  const current = lyrics[versionIdx] ?? lyrics[0];
  const source = (isCurrent ? p.source : null) ?? song.album_title ?? song.artist_name;

  // The player screen follows the music: when the song that was showing ends or is skipped and the next one starts,
  // the screen moves on to it. (Opening another song's page while music plays does not do this: that song was never "playing".)
  const playingId = p.current?.id ?? null;
  const playingSlug = p.current?.slug ?? null;
  const lastPlayingId = useRef(playingId);
  useEffect(() => {
    const before = lastPlayingId.current;
    lastPlayingId.current = playingId;
    if (mode === 'player' && before === song.id && playingId !== null && playingId !== song.id && playingSlug) {
      router.replace(`/song/${playingSlug}`);
    }
  }, [mode, playingId, playingSlug, song.id, router]);

  // Text size is remembered on this device only, and read after the first paint so the page matches what the server sent.
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

  // Counts one "lyrics opened" event per 30 minutes per user; the database does the de-duplication.
  useEffect(() => {
    if (lyrics.length === 0) return;
    void createClient().rpc('record_play', { p_song: song.id, p_kind: 'lyrics_open' });
  }, [song.id, lyrics.length]);

  const targetKey = song.musical_key ? transposeKey(song.musical_key, semitones) : null;
  const preferFlat = targetKey ? prefersFlats(targetKey) : false;
  const lines = useMemo(() => {
    if (!current) return [];
    return transposeLines(parseChordPro(current.body).lines, semitones, preferFlat);
  }, [current, semitones, preferFlat]);
  const chordsAvailable = Boolean(current?.has_chords);
  const chordsOn = chordsAvailable && showChords;

  function close() {
    if (window.history.length > 1) router.back();
    else router.push('/');
  }

  async function toggleLike() {
    const problem = await likes.toggle(song.id);
    if (problem) menu.notify(problem);
  }

  async function share() {
    const outcome = await shareSong(song);
    if (outcome.kind === 'copied') menu.notify('Link copied.');
    else if (outcome.kind === 'link') menu.notify(`Copy this link: ${outcome.url}`);
  }

  const options = (
    <LyricOptions
      versions={lyrics.map((l) => l.version)}
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
  );

  const lyricsPanel = lyricsFailed ? (
    <p className="error" role="alert">Lyrics could not be loaded. Please refresh in a moment.</p>
  ) : lyrics.length === 0 ? (
    <div className="card empty">Lyrics are not available for this song.</div>
  ) : (
    <LyricsBody lines={lines} chordsOn={chordsOn} sizeRem={size} className="lyrics lyrics-panel" />
  );

  const sheets = (
    <>
      {sheet === 'menu' ? (
        <Sheet label={`Options for ${song.title}`} onClose={() => setSheet(null)}>
          <SongMenuBody song={song} userId={userId} onClose={() => setSheet(null)} notify={menu.notify} before={options} />
        </Sheet>
      ) : null}
      {sheet === 'add' ? (
        <Sheet label="Add to list" onClose={() => setSheet(null)}>
          <div className="sheet-head">
            <Cover url={song.cover_url} name={song.title} size={44} />
            <div className="sheet-head-text">
              <div className="sheet-title">{song.title}</div>
              <div className="sheet-sub">{song.artist_name}</div>
            </div>
          </div>
          <div className="sheet-body">
            <AddToListPanel songId={song.id} userId={userId} />
          </div>
        </Sheet>
      ) : null}
    </>
  );

  const moreButton = (
    <button type="button" className="icon-btn" aria-label={`More options for ${song.title}`} onClick={() => setSheet('menu')}>
      <MoreIcon size={22} />
    </button>
  );

  if (mode === 'player') {
    return (
      <article className="screen screen-player">
        <header className="screen-bar">
          <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
            <ChevronDownIcon />
          </button>
          <div className="screen-bar-text">
            <span className="screen-eyebrow">Playing from</span>
            <span className="screen-source">{source}</span>
          </div>
          {moreButton}
        </header>
        <h1 className="sr-only">{song.title}</h1>

        <div className="lyrics-scroll">{lyricsPanel}</div>

        <section className="dock" aria-label="Listen">
          <div className="dock-top">
            <Cover url={song.cover_url} name={song.title} size={52} />
            <div className="dock-text">
              <div className="dock-title">{song.title}</div>
              <Link href={`/artist/${song.artist_slug}`} className="dock-artist">{song.artist_name}</Link>
            </div>
            <button
              type="button"
              className="row-ic row-like"
              aria-pressed={liked}
              aria-label={liked ? `Unlike ${song.title}` : `Like ${song.title}`}
              onClick={() => void toggleLike()}
            >
              <HeartIcon size={22} filled={liked} />
            </button>
          </div>
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
              onClick={() => (isCurrent ? p.toggle() : p.playQueue(queue, song.id, song.album_title ?? song.artist_name))}
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
        </section>
        {sheets}
      </article>
    );
  }

  return (
    <article className="screen screen-lyrics">
      <header className="screen-bar">
        <button type="button" className="icon-btn" aria-label="Close" onClick={close}>
          <ChevronDownIcon />
        </button>
        <div className="screen-bar-text" />
        {moreButton}
      </header>

      <div className="lyrics-head">
        <h1>{song.title}</h1>
        <p className="lyrics-sub">
          <Link href={`/artist/${song.artist_slug}`} className="inline">{song.artist_name}</Link>
          {` · ${languageName}`}
        </p>
        {song.has_audio ? null : <span className="pill pill-quiet lyrics-pill">Lyrics only · no audio file yet</span>}
      </div>

      <div className="lyrics-body">{lyricsPanel}</div>

      <div className="lyrics-actions">
        <button type="button" className="pill-btn" aria-pressed={liked} onClick={() => void toggleLike()}>
          <HeartIcon size={16} filled={liked} /> {liked ? 'Liked' : 'Like'}
        </button>
        <button type="button" className="pill-btn" onClick={() => void share()}>
          <ShareIcon size={16} /> Share
        </button>
        <button type="button" className="pill-btn" onClick={() => setSheet('add')}>
          <ListPlusIcon size={16} /> Add to list
        </button>
        {song.has_audio ? (
          <Link href={`/song/${song.slug}`} className="pill-btn">
            <PlayIcon size={14} /> Open player
          </Link>
        ) : null}
      </div>
      {sheets}
    </article>
  );
}
