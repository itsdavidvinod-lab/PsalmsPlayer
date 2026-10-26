'use client';

// The one audio player of the whole signed-in site. It lives in the app layout, so it keeps playing while people move
// between pages. It owns the <audio> element, the queue, the links to the audio files, the lock-screen controls, and the
// measurement of real listening time (which feeds monthly listeners and Trending).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { ListenReporter, type ListenRpc } from '@/lib/listen-reporter';
import { nextIndex, playableQueue, previousStep } from '@/lib/queue';
import { SignedUrlCache } from '@/lib/signed-url-cache';
import { createClient } from '@/lib/supabase/client';
import type { Song } from '@/lib/types';

export type PlayerApi = {
  current: Song | null;
  queue: Song[];
  index: number;
  /** Playing, or about to (a song is being fetched). Use it for the Play/Pause icon. */
  playing: boolean;
  loading: boolean;
  error: string | null;
  hasNext: boolean;
  /** Starts the song at `startId` from the beginning, with the playable songs of `songs` as the queue. */
  playQueue: (songs: Song[], startId: string) => void;
  toggle: () => void;
  pause: () => void;
  next: () => void;
  previous: () => void;
  seek: (seconds: number) => void;
};

export type PlaybackClock = { position: number; duration: number };

const PlayerContext = createContext<PlayerApi | null>(null);
const ClockContext = createContext<PlaybackClock>({ position: 0, duration: 0 });

export function usePlayer(): PlayerApi {
  const value = useContext(PlayerContext);
  if (!value) throw new Error('usePlayer must be used inside PlayerProvider');
  return value;
}

/** Position and length of the current song. Changes about four times a second, so only the few parts that draw it should use it. */
export function usePlayback(): PlaybackClock {
  return useContext(ClockContext);
}

const listenRpc: ListenRpc = async (sessionId, songId, seconds) => {
  const { data, error } = await createClient().rpc('record_listen', { p_session: sessionId, p_song: songId, p_seconds: seconds });
  if (error) return null;
  const row = Array.isArray(data) ? data[0] : data;
  return (row?.session_id as string | undefined) ?? null;
};

// Asks the database whether this song may be played right now (live song, signed in), then for a one-hour link to the file.
async function fetchSignedUrl(songId: string): Promise<string | null> {
  try {
    const supabase = createClient();
    const { data: path, error } = await supabase.rpc('song_audio_path', { p_song: songId });
    if (error || typeof path !== 'string' || path === '') return null;
    const signed = await supabase.storage.from('audio').createSignedUrl(path, 3600);
    return signed.error || !signed.data ? null : signed.data.signedUrl;
  } catch {
    return null;
  }
}

export function PlayerProvider({ children }: { children: React.ReactNode }) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [urls] = useState(() => new SignedUrlCache(fetchSignedUrl));

  const [queue, setQueue] = useState<Song[]>([]);
  const [index, setIndex] = useState(-1);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [position, setPosition] = useState(0);
  const [duration, setDuration] = useState(0);

  // The newest queue and position, for callbacks that must not wait for a re-render.
  const queueRef = useRef<Song[]>([]);
  const indexRef = useRef(-1);
  const tokenRef = useRef(0); // a newer request to load a song cancels an older one that is still waiting for its link
  const pendingRef = useRef(false); // a song is being fetched; the element may still hold the previous one
  const retriedRef = useRef<string | null>(null);
  const reporterRef = useRef<ListenReporter | null>(null);
  const lastTimeRef = useRef(-1);

  const current = index >= 0 && index < queue.length ? queue[index] : null;

  const startTrack = useCallback(
    async (song: Song, startAt: number, autoplay: boolean) => {
      const el = audioRef.current;
      if (!el) return;
      const token = ++tokenRef.current;
      pendingRef.current = true;
      setLoading(true);
      setError(null);
      const url = await urls.get(song.id);
      if (token !== tokenRef.current) return; // the person chose something else meanwhile
      pendingRef.current = false;
      if (!url) {
        setLoading(false);
        setPlaying(false);
        setError('This song cannot be played right now.');
        return;
      }
      el.src = url;
      if (startAt > 0) el.currentTime = startAt;
      setPosition(startAt);
      lastTimeRef.current = -1;
      if (!autoplay) {
        setLoading(false);
        return;
      }
      try {
        await el.play();
      } catch (e) {
        if (token !== tokenRef.current) return;
        setLoading(false);
        setPlaying(false);
        // Some browsers only start sound inside a tap. The link is loaded now, so the next tap on Play works at once.
        if (!(e instanceof DOMException && e.name === 'AbortError')) setError('Tap Play to start.');
      }
    },
    [urls],
  );

  const goTo = useCallback(
    (i: number) => {
      const song = queueRef.current[i];
      if (!song) return;
      indexRef.current = i;
      setIndex(i);
      retriedRef.current = null;
      audioRef.current?.pause(); // nothing from the old song may be counted for the new one while its link is fetched
      void startTrack(song, 0, true);
    },
    [startTrack],
  );

  const playQueue = useCallback(
    (songs: Song[], startId: string) => {
      const built = playableQueue(songs, startId);
      if (!built) return;
      queueRef.current = built.queue;
      setQueue(built.queue);
      goTo(built.index);
    },
    [goTo],
  );

  const toggle = useCallback(() => {
    const el = audioRef.current;
    const song = queueRef.current[indexRef.current];
    if (!el || !song || pendingRef.current) return;
    if (!el.getAttribute('src') || el.error) {
      void startTrack(song, el.currentTime || 0, true);
      return;
    }
    if (el.paused) {
      setError(null);
      el.play().catch(() => setPlaying(false));
    } else {
      el.pause();
    }
  }, [startTrack]);

  const pause = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  const seek = useCallback((seconds: number) => {
    const el = audioRef.current;
    if (!el || !el.getAttribute('src')) return;
    const target = Math.max(0, seconds);
    el.currentTime = target;
    setPosition(target);
  }, []);

  const next = useCallback(() => {
    const n = nextIndex(queueRef.current.length, indexRef.current);
    if (n !== null) goTo(n);
  }, [goTo]);

  const previous = useCallback(() => {
    const el = audioRef.current;
    const step = previousStep(indexRef.current, el?.currentTime ?? 0);
    if (step.restart) seek(0);
    else goTo(step.index);
  }, [goTo, seek]);

  // One listening reporter per song. Changing song reports what was heard of the old one and starts afresh.
  const currentId = current?.id ?? null;
  useEffect(() => {
    if (!currentId) return;
    const reporter = new ListenReporter(currentId, listenRpc);
    reporterRef.current = reporter;
    return () => {
      reporterRef.current = null;
      void reporter.end();
    };
  }, [currentId]);

  // Once a second: is the song really being heard? Playing, not muted, volume up, not buffering, and the clock is moving.
  useEffect(() => {
    const id = window.setInterval(() => {
      const el = audioRef.current;
      const reporter = reporterRef.current;
      if (!el || !reporter) return;
      const t = el.currentTime;
      const advancing = t !== lastTimeRef.current;
      lastTimeRef.current = t;
      const counting = !el.paused && !el.ended && !el.muted && el.volume > 0 && el.readyState >= 3 && advancing;
      reporter.tick(counting);
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // While the next song is not yet playing, fetch its link so skipping is quick.
  const upcomingId = index >= 0 && index + 1 < queue.length ? queue[index + 1].id : null;
  useEffect(() => {
    if (upcomingId) void urls.get(upcomingId);
  }, [upcomingId, urls]);

  // Lock-screen and headset controls.
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    navigator.mediaSession.metadata = current
      ? new MediaMetadata({ title: current.title, artist: current.artist_name, album: current.album_title ?? '' })
      : null;
  }, [current]);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    navigator.mediaSession.playbackState = current ? (playing ? 'playing' : 'paused') : 'none';
  }, [current, playing]);
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    const ms = navigator.mediaSession;
    const set = (action: MediaSessionAction, handler: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(action, handler);
      } catch {
        // This browser does not support that action.
      }
    };
    set('play', () => toggle());
    set('pause', () => pause());
    set('previoustrack', () => previous());
    set('nexttrack', () => next());
    set('seekto', (d) => {
      if (typeof d.seekTime === 'number') seek(d.seekTime);
    });
    return () => {
      (['play', 'pause', 'previoustrack', 'nexttrack', 'seekto'] as MediaSessionAction[]).forEach((a) => set(a, null));
    };
  }, [toggle, pause, previous, next, seek]);

  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator) || !(duration > 0)) return;
    try {
      navigator.mediaSession.setPositionState({ duration, playbackRate: 1, position: Math.min(position, duration) });
    } catch {
      // Position display is a nicety.
    }
    // Position changes four times a second; the lock screen needs it far less often, so this runs every 5 seconds.
  }, [duration, Math.floor(position / 5)]);

  const onError = () => {
    const el = audioRef.current;
    const song = queueRef.current[indexRef.current];
    if (!el || !song || !el.getAttribute('src')) return;
    // A link that expired while the person was away: get a new one once and carry on from the same place.
    if (retriedRef.current !== song.id) {
      retriedRef.current = song.id;
      urls.invalidate(song.id);
      void startTrack(song, el.currentTime || 0, true);
      return;
    }
    setLoading(false);
    setPlaying(false);
    setError('Playback stopped. Check your connection and tap Play to try again.');
  };

  const onEnded = () => {
    reporterRef.current?.tick(false);
    const n = nextIndex(queueRef.current.length, indexRef.current);
    if (n === null) {
      setPlaying(false);
      return;
    }
    goTo(n);
  };

  const api = useMemo<PlayerApi>(
    () => ({
      current,
      queue,
      index,
      playing: playing || loading,
      loading,
      error,
      hasNext: index >= 0 && index + 1 < queue.length,
      playQueue,
      toggle,
      pause,
      next,
      previous,
      seek,
    }),
    [current, queue, index, playing, loading, error, playQueue, toggle, pause, next, previous, seek],
  );
  const clock = useMemo<PlaybackClock>(() => ({ position, duration }), [position, duration]);

  return (
    <PlayerContext.Provider value={api}>
      <ClockContext.Provider value={clock}>
        {children}
        <audio
          ref={audioRef}
          preload="auto"
          onPlay={() => setPlaying(true)}
          onPlaying={() => {
            setLoading(false);
            setPlaying(true);
            retriedRef.current = null;
          }}
          onPause={() => {
            setPlaying(false);
            reporterRef.current?.tick(false);
          }}
          onWaiting={() => reporterRef.current?.tick(false)}
          onVolumeChange={(e) => {
            if (e.currentTarget.muted || e.currentTarget.volume === 0) reporterRef.current?.tick(false);
          }}
          onTimeUpdate={(e) => setPosition(e.currentTarget.currentTime)}
          onDurationChange={(e) => {
            const d = e.currentTarget.duration;
            setDuration(Number.isFinite(d) ? d : 0);
          }}
          onEnded={onEnded}
          onError={onError}
        />
      </ClockContext.Provider>
    </PlayerContext.Provider>
  );
}
