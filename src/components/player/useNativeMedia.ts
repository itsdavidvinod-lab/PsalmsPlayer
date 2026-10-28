'use client';

import { useEffect, useRef } from 'react';
import { nativeMedia, nativeMediaAvailable } from '@/lib/native-media';
import { nativeActionCommand, nativeMediaState } from '@/lib/native-media-state';

type Song = { title: string; artist_name: string; album_title: string | null };

/** Inside the Android app: tells the app which song is playing (so Android keeps the music alive with the screen off and shows the
 *  notification and lock-screen controls) and carries out the buttons pressed there. Does nothing in a normal browser. */
export function useNativeMedia(args: {
  current: Song | null;
  playing: boolean;
  position: number;
  duration: number;
  toggle: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
}) {
  const { current, playing, position, duration } = args;

  const hadSong = useRef(false);
  useEffect(() => {
    if (!nativeMediaAvailable()) return;
    if (!current) {
      if (hadSong.current) nativeMedia.stop();
      hadSong.current = false;
      return;
    }
    hadSong.current = true;
    nativeMedia.update(nativeMediaState(current, playing, position, duration));
    // Position changes four times a second; the notification extrapolates it, so it is refreshed only every 5 seconds.
  }, [current, playing, duration, Math.floor(position / 5)]);

  // Always the newest callbacks, without re-subscribing to the app's events each time one changes.
  const latest = useRef(args);
  useEffect(() => {
    latest.current = args;
  });
  useEffect(() => {
    if (!nativeMediaAvailable()) return;
    let handle: { remove(): Promise<void> } | null = null;
    let cancelled = false;
    nativeMedia
      .onAction((a) => {
        const l = latest.current;
        const cmd = nativeActionCommand(a, l.playing);
        if (!cmd) return;
        if (cmd.kind === 'seek') l.seek(cmd.seconds);
        else if (cmd.kind === 'toggle') l.toggle();
        else if (cmd.kind === 'pause') l.pause();
        else if (cmd.kind === 'next') l.next();
        else l.previous();
      })
      .then((h) => {
        if (cancelled) void h.remove();
        else handle = h;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (handle) void handle.remove();
    };
  }, []);
}
