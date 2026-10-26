// Rules for Stage mode that do not depend on the screen, so they can be tested directly.
import { semitonesBetween, transposeKey } from './chordpro.ts';

export const STAGE_MIN_SIZE = 1.2;
export const STAGE_MAX_SIZE = 4;
export const STAGE_ADJUST_LIMIT = 6;

/** How far to move a song's chords: from its own key to the key chosen in the setlist, plus any change made on stage. */
export function stageSemitones(baseKey: string | null, keyOverride: string | null, adjust: number): number {
  const fromSetlist = baseKey && keyOverride ? semitonesBetween(baseKey, keyOverride) : 0;
  return fromSetlist + adjust;
}

/** The key to show for a song after all changes, or null when the song has no key. */
export function stageKeyLabel(baseKey: string | null, semitones: number): string | null {
  return baseKey ? transposeKey(baseKey, semitones) : null;
}

export function clampAdjust(adjust: number): number {
  return Math.max(-STAGE_ADJUST_LIMIT, Math.min(STAGE_ADJUST_LIMIT, adjust));
}

export function clampSize(size: number): number {
  return Math.max(STAGE_MIN_SIZE, Math.min(STAGE_MAX_SIZE, Math.round(size * 10) / 10));
}

/** Moves through the setlist without running off either end. */
export function stageIndex(current: number, delta: number, length: number): number {
  return Math.max(0, Math.min(length - 1, current + delta));
}

/** A swipe counts when it is long enough and clearly more sideways than up or down. Negative dx (to the left) means next. */
export function swipeDirection(dx: number, dy: number, minPx = 60): -1 | 0 | 1 {
  if (Math.abs(dx) < minPx || Math.abs(dx) < Math.abs(dy) * 2) return 0;
  return dx < 0 ? 1 : -1;
}
