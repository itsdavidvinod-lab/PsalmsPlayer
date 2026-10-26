'use client';

import { useEffect, useRef } from 'react';
import { ListenMeter } from '@/lib/listen';
import { createClient } from '@/lib/supabase/client';
import { YT_PLAYING, loadYouTubeApi, type YTPlayer } from '@/lib/youtube-api';
import { youtubeEmbedUrl } from '@/lib/youtube';

const BEAT_MS = 15_000; // how often play time is reported while a song is playing
const POLL_MS = 1_000;

type Props = { songId: string; youtubeId: string; title: string };

/** The video, plus measurement of real listening time (playing, audible) reported to record_listen(). */
export default function SongPlayer({ songId, youtubeId, title }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    let player: YTPlayer | null = null;
    let ready = false;
    let wasCounting = false;
    let sessionId: string | null = null;
    let chain: Promise<void> = Promise.resolve();
    const meter = new ListenMeter();
    const supabase = createClient();

    // One report at a time, in order. A failed report is dropped: the number must never be too high.
    const send = (seconds: number) => {
      chain = chain.then(async () => {
        try {
          if (!sessionId) {
            const { data } = await supabase.rpc('record_listen', { p_session: null, p_song: songId, p_seconds: 0 });
            const row = Array.isArray(data) ? data[0] : data;
            sessionId = row?.session_id ?? null;
            return; // starting a session credits nothing; time is reported from the next beat on
          }
          if (seconds > 0) await supabase.rpc('record_listen', { p_session: sessionId, p_song: songId, p_seconds: seconds });
        } catch {
          // Offline or signed out: nothing to report.
        }
      });
    };

    const audiblePlaying = (): boolean => {
      if (!player || !ready) return false;
      try {
        return player.getPlayerState() === YT_PLAYING && !player.isMuted() && player.getVolume() > 0;
      } catch {
        return false;
      }
    };

    const flush = () => send(meter.take());

    const poll = window.setInterval(() => {
      const counting = audiblePlaying();
      if (counting && !sessionId && !wasCounting) send(0); // first moment of play: start the session so its clock starts too
      meter.set(counting);
      if (wasCounting && !counting) flush(); // paused, muted or ended: report what was heard
      wasCounting = counting;
    }, POLL_MS);
    const beat = window.setInterval(() => {
      if (wasCounting) flush();
    }, BEAT_MS);

    loadYouTubeApi()
      .then((YT) => {
        const el = frame.current;
        if (cancelled || !el) return;
        player = new YT.Player(el, { events: { onReady: () => { ready = true; }, onStateChange: () => { /* the poll reads the state */ } } });
        // Some builds fire onReady before the constructor returns; the poll also treats a readable state as ready.
        window.setTimeout(() => { ready = true; }, 1500);
      })
      .catch(() => {
        // The video still plays; listening time just is not measured in this browser.
      });

    return () => {
      cancelled = true;
      window.clearInterval(poll);
      window.clearInterval(beat);
      meter.set(false);
      flush();
    };
  }, [songId]);

  return (
    <div className="video">
      <iframe
        ref={frame}
        src={youtubeEmbedUrl(youtubeId)}
        title={`${title} on YouTube`}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
        referrerPolicy="strict-origin-when-cross-origin"
        loading="lazy"
      />
    </div>
  );
}
