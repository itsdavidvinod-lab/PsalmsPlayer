// What the website tells the Android app about the song that is playing, and what the app's notification buttons ask for.
// Pure functions only (no Capacitor import), so they are unit-tested in node. The plugin itself is in native-media.ts.

export type NativeMediaState = {
  title: string;
  artist: string;
  album: string;
  playing: boolean;
  /** seconds */
  position: number;
  /** seconds, 0 when unknown */
  duration: number;
};

export type NativeMediaAction = { action: 'play' | 'pause' | 'next' | 'previous' | 'seek'; seekTo?: number };

export type NativeMediaCommand = { kind: 'toggle' | 'pause' | 'next' | 'previous' } | { kind: 'seek'; seconds: number };

const TEXT_MAX = 200;

function clip(text: string | null | undefined): string {
  return (text ?? '').trim().slice(0, TEXT_MAX);
}

function seconds(n: number): number {
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function nativeMediaState(
  song: { title: string; artist_name: string; album_title: string | null },
  playing: boolean,
  position: number,
  duration: number,
): NativeMediaState {
  const d = seconds(duration);
  const p = seconds(position);
  return {
    title: clip(song.title),
    artist: clip(song.artist_name),
    album: clip(song.album_title),
    playing,
    position: d > 0 ? Math.min(p, d) : p,
    duration: d,
  };
}

/** What the player should do for a button pressed on the notification or lock screen. "play" while already playing, and "pause"
 *  while already paused, are ignored (the player's own toggle would otherwise flip the state the wrong way). */
export function nativeActionCommand(a: NativeMediaAction, playing: boolean): NativeMediaCommand | null {
  switch (a.action) {
    case 'play':
      return playing ? null : { kind: 'toggle' };
    case 'pause':
      return playing ? { kind: 'pause' } : null;
    case 'next':
      return { kind: 'next' };
    case 'previous':
      return { kind: 'previous' };
    case 'seek':
      return typeof a.seekTo === 'number' && Number.isFinite(a.seekTo) && a.seekTo >= 0 ? { kind: 'seek', seconds: a.seekTo } : null;
    default:
      return null;
  }
}
