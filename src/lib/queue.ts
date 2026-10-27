// Play-queue rules, kept free of React so they can be tested directly.

export type Playable = { id: string; has_audio: boolean };

/** The songs of a list that can really be played (they have a hosted file), in order, and where playback starts.
 *  Returns null when the song asked for has no audio. */
export function playableQueue<T extends Playable>(songs: T[], startId: string): { queue: T[]; index: number } | null {
  const queue = songs.filter((s) => s.has_audio);
  const index = queue.findIndex((s) => s.id === startId);
  return index < 0 ? null : { queue, index };
}

/** What the repeat button does: nothing (play to the end), repeat the whole queue, or repeat one song. */
export type RepeatMode = 'off' | 'all' | 'one';

/** One button cycles through the three: off, then all, then one, then off again. */
export function nextRepeatMode(mode: RepeatMode): RepeatMode {
  return mode === 'off' ? 'all' : mode === 'all' ? 'one' : 'off';
}

export function isRepeatMode(value: unknown): value is RepeatMode {
  return value === 'off' || value === 'all' || value === 'one';
}

/** The index after this one. At the end it is null, or the start again when the whole queue repeats. */
export function nextIndex(length: number, index: number, wrap = false): number | null {
  if (index + 1 < length) return index + 1;
  return wrap && length > 0 ? 0 : null;
}

/** Whether the Next button has anywhere to go. */
export function hasNextSong(length: number, index: number, repeat: RepeatMode): boolean {
  if (index < 0) return false;
  return index + 1 < length || (repeat === 'all' && length > 1);
}

/** What the Previous button does: more than 3 seconds in (or on the first song) restarts the song; otherwise go back one. */
export function previousStep(index: number, positionS: number): { restart: boolean; index: number } {
  if (positionS > 3 || index <= 0) return { restart: true, index: Math.max(index, 0) };
  return { restart: false, index: index - 1 };
}

/** A random order of the queue with the song that is playing first, so turning shuffle on never changes what you hear.
 *  The queue passed in is not changed. `random` returns a number from 0 up to (not including) 1. */
export function shuffleQueue<T extends { id: string }>(queue: T[], currentId: string, random: () => number = Math.random): T[] {
  const current = queue.find((s) => s.id === currentId);
  const rest = queue.filter((s) => s.id !== currentId);
  for (let i = rest.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [rest[i], rest[j]] = [rest[j], rest[i]];
  }
  return current ? [current, ...rest] : rest;
}

/** Where the song that is playing sits in the original order, for when shuffle is turned off again. */
export function indexInOrder<T extends { id: string }>(order: T[], currentId: string): number {
  return Math.max(0, order.findIndex((s) => s.id === currentId));
}

/** A random song of the queue that can be played, for "Shuffle play". Null when there is none. */
export function randomPlayableId<T extends Playable>(songs: T[], random: () => number = Math.random): string | null {
  const playable = songs.filter((s) => s.has_audio);
  if (playable.length === 0) return null;
  return playable[Math.min(playable.length - 1, Math.floor(random() * playable.length))].id;
}

/** What is remembered on this device between visits: shuffle and repeat. Anything else in the stored text is ignored. */
export function parsePlayerPrefs(text: string | null): { shuffle: boolean; repeat: RepeatMode } {
  const fallback = { shuffle: false, repeat: 'off' as RepeatMode };
  if (!text) return fallback;
  try {
    const raw = JSON.parse(text) as { shuffle?: unknown; repeat?: unknown } | null;
    return { shuffle: raw?.shuffle === true, repeat: isRepeatMode(raw?.repeat) ? raw.repeat : 'off' };
  } catch {
    return fallback;
  }
}
