'use client';

import { useEffect, useState } from 'react';
import { formatClock } from '@/lib/format';
import { usePlayback, usePlayer } from './PlayerProvider';

/** How long the round knob stays after the finger or mouse lets go, so a tap shows where it landed. */
const KNOB_LINGER_MS = 700;

/**
 * Elapsed time, a thin bar, and total time. `idleDuration` is shown while this song is not the one loaded in the player.
 *
 * The real `<input type="range">` sits on top of the drawn bar, invisible: the whole bar (32px tall, edge to edge) is the touch target,
 * a tap anywhere jumps there, a slide anywhere drags, and the keyboard and screen readers work as for any slider. The rail, fill and
 * round knob under it are only drawing (see `.seek-*` in globals.css). The knob shows while the bar is held, and for a moment after.
 */
export default function SeekBar({ active = true, idleDuration = 0, className = '' }: { active?: boolean; idleDuration?: number; className?: string }) {
  const { seek } = usePlayer();
  const { position, duration } = usePlayback();
  const total = active ? duration : idleDuration;
  const max = Math.max(1, Math.floor(total));
  const value = active ? Math.min(Math.floor(position), max) : 0;
  const off = !active || duration <= 0;
  const percent = `${(value / max) * 100}%`;

  const [held, setHeld] = useState(false); // a finger or the mouse is down on the bar
  const [shown, setShown] = useState(false); // the knob is visible: while held, and for a moment after

  // Let go anywhere (the finger or mouse may leave the bar while sliding), or the browser takes the touch over to scroll.
  useEffect(() => {
    if (!held) return;
    const release = () => setHeld(false);
    window.addEventListener('pointerup', release);
    window.addEventListener('pointercancel', release);
    return () => {
      window.removeEventListener('pointerup', release);
      window.removeEventListener('pointercancel', release);
    };
  }, [held]);

  useEffect(() => {
    if (held) {
      setShown(true);
      return;
    }
    if (!shown) return;
    const timer = window.setTimeout(() => setShown(false), KNOB_LINGER_MS);
    return () => window.clearTimeout(timer);
  }, [held, shown]);

  return (
    <div className={`seek ${className}`.trim()}>
      <span className="time">{formatClock(active ? position : 0)}</span>
      <div
        className={`seek-track${shown ? ' is-touched' : ''}${off ? ' is-off' : ''}`}
        onPointerDown={() => {
          if (!off) setHeld(true);
        }}
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
          <span className="seek-rail">
            <span className="seek-fill" style={{ width: percent }} />
            <span className="seek-knob" style={{ left: percent }} />
          </span>
        </span>
      </div>
      <span className="time">{formatClock(total)}</span>
    </div>
  );
}
