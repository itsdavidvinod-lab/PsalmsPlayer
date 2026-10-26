'use client';

import { formatClock } from '@/lib/format';
import { usePlayback, usePlayer } from './PlayerProvider';

/** Elapsed time, a slider, and total time. `idleDuration` is shown while this song is not the one loaded in the player. */
export default function SeekBar({ active = true, idleDuration = 0, className = '' }: { active?: boolean; idleDuration?: number; className?: string }) {
  const { seek } = usePlayer();
  const { position, duration } = usePlayback();
  const total = active ? duration : idleDuration;
  const max = Math.max(1, Math.floor(total));
  const value = active ? Math.min(Math.floor(position), max) : 0;
  return (
    <div className={`seek ${className}`.trim()}>
      <span className="time">{formatClock(active ? position : 0)}</span>
      <input
        type="range"
        min={0}
        max={max}
        step={1}
        value={value}
        disabled={!active || duration <= 0}
        onChange={(e) => seek(Number(e.target.value))}
        aria-label="Seek"
      />
      <span className="time">{formatClock(total)}</span>
    </div>
  );
}
