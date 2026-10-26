// Play-queue rules, kept free of React so they can be tested directly.

export type Playable = { id: string; has_audio: boolean };

/** The songs of a list that can really be played (they have a hosted file), in order, and where playback starts.
 *  Returns null when the song asked for has no audio. */
export function playableQueue<T extends Playable>(songs: T[], startId: string): { queue: T[]; index: number } | null {
  const queue = songs.filter((s) => s.has_audio);
  const index = queue.findIndex((s) => s.id === startId);
  return index < 0 ? null : { queue, index };
}

/** The index after this one, or null at the end of the queue. */
export function nextIndex(length: number, index: number): number | null {
  return index + 1 < length ? index + 1 : null;
}

/** What the Previous button does: more than 3 seconds in (or on the first song) restarts the song; otherwise go back one. */
export function previousStep(index: number, positionS: number): { restart: boolean; index: number } {
  if (positionS > 3 || index <= 0) return { restart: true, index: Math.max(index, 0) };
  return { restart: false, index: index - 1 };
}
