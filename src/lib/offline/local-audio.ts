// Plays a saved recording straight from the phone: the Blob in storage becomes a short address the <audio> element can open.

import { offlineStore, offlineSupported } from './device.ts';

const urls = new Map<string, string>();

/** An address for the saved recording of this song, or null when none is saved here (always null outside the app). */
export async function localAudioUrl(songId: string): Promise<string | null> {
  if (!offlineSupported()) return null;
  const known = urls.get(songId);
  if (known) return known;
  try {
    const blob = await offlineStore().getAudio(songId);
    if (!blob) return null;
    const url = URL.createObjectURL(blob);
    urls.set(songId, url);
    return url;
  } catch {
    return null; // storage trouble: the song simply streams, as it does for everyone else
  }
}

/** Lets go of the addresses of these songs (all of them when none are named), after their copies were removed or replaced. */
export function forgetLocalAudio(songIds?: string[]): void {
  for (const id of songIds ?? [...urls.keys()]) {
    const url = urls.get(id);
    if (url) {
      URL.revokeObjectURL(url);
      urls.delete(id);
    }
  }
}
