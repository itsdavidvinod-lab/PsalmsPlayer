'use client';

import { useEffect, useRef, useState } from 'react';
import { formatClock } from '@/lib/format';
import { usePlayback, usePlayer } from './PlayerProvider';

/** How long the round knob stays after the finger or mouse lets go, so a tap shows where it landed. */
const KNOB_LINGER_MS = 700;

/**
 * Elapsed time, a thin bar, and total time. `idleDuration` is shown while this song is not the one loaded in the player.
 *
 * The bar reads the finger (or mouse) itself: a press anywhere on it jumps there, and gliding from anywhere drags, even when the
 * finger leaves the bar sideways or up and down. The browsers' own range sliders do not do this alike (iPhone only drags when the
 * knob itself is grabbed), so the `<input type="range">` underneath takes no touches; it stays for the keyboard and screen readers.
 * The rail, fill and round knob are only drawing (see `.seek-*` in globals.css). The knob shows while the bar is held, and for a
 * moment after.
 */
export default function SeekBar({ active = true, idleDuration = 0, className = '' }: { active?: boolean; idleDuration?: number; className?: string }) {
  const { seek } = usePlayer();
  const { position, duration } = usePlayback();
  const total = active ? duration : idleDuration;
  const max = Math.max(1, Math.floor(total));
  const value = active ? Math.min(Math.floor(position), max) : 0;
  const off = !active || duration <= 0;
  const percent = `${(value / max) * 100}%`;

  const railRef = useRef<HTMLSpanElement | null>(null);
  const lastSeconds = useRef(-1);
  const [held, setHeld] = useState(false); // a finger or the mouse is down on the bar
  const [shown, setShown] = useState(false); // the knob is visible: while held, and for a moment after

  useEffect(() => {
    if (held) {
      setShown(true);
      return;
    }
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(false), KNOB_LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [held, shown]);

  /** Seeks to the place under the finger: the rail's left end is 0:00 and its right end is the end of the song. */
  function seekToPointer(clientX: number) {
    const rail = railRef.current;
    if (!rail) return;
    const box = rail.getBoundingClientRect();
    if (box.width <= 0) return;
    const seconds = Math.round(Math.min(1, Math.max(0, (clientX - box.left) / box.width)) * max);
    if (seconds === lastSeconds.current) return; // the same second again: nothing to do
    lastSeconds.current = seconds;
    seek(seconds);
  }

  return (
    <div className={`seek ${className}`.trim()}>
      <span className="time">{formatClock(active ? position : 0)}</span>
      <div
        className={`seek-track${shown ? ' is-touched' : ''}${off ? ' is-off' : ''}`}
        onPointerDown={(e) => {
          if (off || (e.pointerType === 'mouse' && e.button !== 0)) return;
          try {
            e.currentTarget.setPointerCapture(e.pointerId); // keep getting the moves when the finger leaves the bar
          } catch {
            /* a pointer that is already gone: the press still counts */
          }
          lastSeconds.current = -1;
          setHeld(true);
          seekToPointer(e.clientX);
        }}
        onPointerMove={(e) => {
          if (held && e.currentTarget.hasPointerCapture(e.pointerId)) seekToPointer(e.clientX);
        }}
        onPointerUp={() => setHeld(false)}
        onPointerCancel={() => setHeld(false)}
        onLostPointerCapture={() => setHeld(false)}
      >
        <input
          type="range"
          min={0}
          max={max}
          step={1}
          value={value}
          disabled={off}
          onChange={(e) => seek(Number(e.target.value))}
          aria-label="Seek"
        />
        <span className="seek-lane" aria-hidden="true">
          <span className="seek-rail" ref={railRef}>
            <span className="seek-fill" style={{ width: percent }} />
            <span className="seek-knob" style={{ left: percent }} />
          </span>
        </span>
      </div>
      <span className="time">{formatClock(total)}</span>
    </div>
  );
}
