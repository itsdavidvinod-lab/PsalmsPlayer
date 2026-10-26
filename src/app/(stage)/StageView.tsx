'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import LyricsBody from '@/components/LyricsBody';
import { parseChordPro, prefersFlats, transposeLines } from '@/lib/chordpro';
import { STAGE_ADJUST_LIMIT, clampAdjust, clampSize, stageIndex, stageKeyLabel, stageSemitones, swipeDirection } from '@/lib/stage';
import { createClient } from '@/lib/supabase/client';
import type { LyricsVersion, StageItem } from '@/lib/types';

const VERSION_LABEL: Record<LyricsVersion['version'], string> = { original: 'Original', romanized: 'Romanized', meaning: 'Meaning' };
const SIZE_STORAGE_KEY = 'stage-size';

type Props = { title: string; items: StageItem[]; backHref: string };

export default function StageView({ title, items, backHref }: Props) {
  const [index, setIndex] = useState(0);
  const [size, setSize] = useState(2);
  const [showChords, setShowChords] = useState(true);
  const [adjust, setAdjust] = useState<Record<string, number>>({});
  const [versionPref, setVersionPref] = useState<LyricsVersion['version']>('original');
  const [awake, setAwake] = useState<boolean | null>(null);
  const body = useRef<HTMLDivElement>(null);
  const touch = useRef<{ x: number; y: number } | null>(null);

  const item = items[index];
  const total = items.length;
  const adj = adjust[item.id] ?? 0;
  const semitones = stageSemitones(item.baseKey, item.keyOverride, adj);
  const keyLabel = stageKeyLabel(item.baseKey, semitones);
  const version = item.lyrics.find((l) => l.version === versionPref) ?? item.lyrics[0];
  const chordsAvailable = Boolean(version?.has_chords);

  const lines = useMemo(() => {
    if (!version) return [];
    return transposeLines(parseChordPro(version.body).lines, semitones, keyLabel ? prefersFlats(keyLabel) : false);
  }, [version, semitones, keyLabel]);

  const go = (delta: number) => setIndex((i) => stageIndex(i, delta, total));

  // The text size is a convenience that stays on this device.
  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(SIZE_STORAGE_KEY));
      if (saved > 0) setSize(clampSize(saved));
    } catch {
      // Storage can be blocked; the default size is fine.
    }
  }, []);
  function changeSize(delta: number) {
    setSize((cur) => {
      const next = clampSize(cur + delta);
      try {
        window.localStorage.setItem(SIZE_STORAGE_KEY, String(next));
      } catch {
        // Not saved; the size still changes for now.
      }
      return next;
    });
  }

  // A new song starts at the top.
  useEffect(() => {
    body.current?.scrollTo({ top: 0 });
  }, [index]);

  // Opening a song's lyrics here counts like opening them on the song page (the database counts once per 30 minutes).
  useEffect(() => {
    if (item.available && item.songId) void createClient().rpc('record_play', { p_song: item.songId, p_kind: 'lyrics_open' });
  }, [item.available, item.songId]);

  // Keep the screen on while on stage. Browsers drop the lock when the page is hidden, so ask again when it returns.
  useEffect(() => {
    let sentinel: WakeLockSentinel | null = null;
    let stopped = false;
    const supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
    if (!supported) {
      setAwake(false);
      return;
    }
    const request = async () => {
      try {
        sentinel = await navigator.wakeLock.request('screen');
        if (!stopped) setAwake(true);
      } catch {
        if (!stopped) setAwake(false);
      }
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') void request();
    };
    void request();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      stopped = true;
      document.removeEventListener('visibilitychange', onVisible);
      void sentinel?.release().catch(() => undefined);
    };
  }, []);

  // Keys for a laptop or a pedal: arrows and page keys change song, plus and minus change the text size.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (e.ctrlKey || e.metaKey || e.altKey || (t && /^(INPUT|SELECT|TEXTAREA)$/.test(t.tagName))) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') go(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') go(-1);
      else if (e.key === '+' || e.key === '=') changeSize(0.2);
      else if (e.key === '-') changeSize(-0.2);
      else return;
      e.preventDefault();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // go() and changeSize() only use state setters and `total`, so they never go stale.
  }, [total]);

  return (
    <div className="stage">
      <header className="stage-top">
        <Link href={backHref} className="btn btn-ghost" aria-label="Close Stage mode">✕ Close</Link>
        <div className="stage-title">
          <strong>{title}</strong>
          <span className="small muted" aria-live="polite">{`Song ${index + 1} of ${total}`}</span>
        </div>
        <span className="small muted stage-awake" role="status">{awake === true ? 'Screen stays on' : awake === false ? 'Screen may dim' : ''}</span>
      </header>

      <div
        className="stage-body"
        ref={body}
        onTouchStart={(e) => {
          const t = e.touches[0];
          touch.current = { x: t.clientX, y: t.clientY };
        }}
        onTouchEnd={(e) => {
          const start = touch.current;
          touch.current = null;
          if (!start) return;
          const t = e.changedTouches[0];
          const dir = swipeDirection(t.clientX - start.x, t.clientY - start.y);
          if (dir !== 0) go(dir);
        }}
      >
        {item.available ? (
          <>
            <h1 className="stage-song">{item.title}</h1>
            <p className="muted stage-meta">
              {item.artist}
              {keyLabel ? ` · Key ${keyLabel}` : ''}
            </p>
            {item.lyrics.length > 1 ? (
              <div className="tabs" role="group" aria-label="Lyrics version">
                {item.lyrics.map((l) => (
                  <button key={l.version} type="button" className="tab" aria-pressed={l === version} onClick={() => setVersionPref(l.version)}>
                    {VERSION_LABEL[l.version]}
                  </button>
                ))}
              </div>
            ) : null}
            {lines.length > 0 ? (
              <LyricsBody lines={lines} chordsOn={chordsAvailable && showChords} sizeRem={size} className="lyrics stage-lyrics" />
            ) : (
              <p className="muted">No lyrics are available for this song.</p>
            )}
          </>
        ) : (
          <>
            <h1 className="stage-song muted">Not available right now</h1>
            <p className="muted">This slot keeps its place in the setlist. Use Next to carry on.</p>
          </>
        )}
      </div>

      <footer className="stage-bar">
        <button type="button" className="btn stage-nav" onClick={() => go(-1)} disabled={index === 0} aria-label="Previous song">← Previous</button>

        {item.available && chordsAvailable ? (
          <>
            <div className="stepper" role="group" aria-label="Transpose">
              <button type="button" onClick={() => setAdjust((a) => ({ ...a, [item.id]: clampAdjust((a[item.id] ?? 0) - 1) }))} disabled={adj <= -STAGE_ADJUST_LIMIT} aria-label="Down one semitone">−</button>
              <span>{keyLabel ? `Key ${keyLabel}` : adj === 0 ? 'Original' : `${adj > 0 ? '+' : ''}${adj}`}</span>
              <button type="button" onClick={() => setAdjust((a) => ({ ...a, [item.id]: clampAdjust((a[item.id] ?? 0) + 1) }))} disabled={adj >= STAGE_ADJUST_LIMIT} aria-label="Up one semitone">+</button>
            </div>
            <button type="button" className="btn" aria-pressed={showChords} onClick={() => setShowChords((v) => !v)}>
              {showChords ? 'Hide chords' : 'Show chords'}
            </button>
          </>
        ) : null}

        <div className="stepper" role="group" aria-label="Text size">
          <button type="button" onClick={() => changeSize(-0.2)} aria-label="Smaller text">A−</button>
          <span>Size</span>
          <button type="button" onClick={() => changeSize(0.2)} aria-label="Larger text">A+</button>
        </div>

        <button type="button" className="btn btn-primary stage-nav" onClick={() => go(1)} disabled={index >= total - 1} aria-label="Next song">Next →</button>
      </footer>
    </div>
  );
}
