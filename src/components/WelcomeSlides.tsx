'use client';

import { useEffect, useRef, useState } from 'react';
import { HeartIcon, LyricsIcon, PlayIcon, StageIcon } from '@/components/icons';
import { APP_NAME } from '@/lib/brand';
import { WELCOME_COOKIE } from '@/lib/native-app';

const SLIDES = [
  { Icon: LyricsIcon, title: 'Songs for your community', text: 'Find songs in your language, read the lyrics, and see the chords when the writer shares them.' },
  { Icon: PlayIcon, title: 'A player that stays with you', text: 'The player stays on every page. Shuffle, repeat, and slide to any moment in a song.' },
  { Icon: HeartIcon, title: 'Your own library', text: 'Like songs, follow artists, and make playlists and setlists for home, church and services.' },
  { Icon: StageIcon, title: 'Stage mode for services', text: 'Big, clear lyrics for the service, and your screen stays awake while you sing.' },
];

/**
 * The first thing the Android app shows: a few swipeable slides, then the sign-in page underneath. The login page renders this only for
 * the app (user agent) and only until the "seen" cookie is set, so it is already in the first paint and never flashes the sign-in page.
 * The slides are a plain scroll-snap strip: swiping works even before the page's script has loaded.
 */
export default function WelcomeSlides() {
  const [open, setOpen] = useState(true);
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement | null>(null);
  const next = useRef<HTMLButtonElement | null>(null);
  const last = index === SLIDES.length - 1;

  useEffect(() => {
    next.current?.focus({ preventScroll: true });
  }, []);

  function finish() {
    try {
      document.cookie = `${WELCOME_COOKIE}=1; Max-Age=31536000; Path=/; SameSite=Lax${window.location.protocol === 'https:' ? '; Secure' : ''}`;
    } catch {
      /* cookies blocked: the slides will show again next time, nothing else is lost */
    }
    setOpen(false);
  }

  function goTo(i: number) {
    const el = track.current;
    if (!el) return;
    const left = Math.max(0, Math.min(SLIDES.length - 1, i)) * el.clientWidth;
    const calm = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (typeof el.scrollTo === 'function') el.scrollTo({ left, behavior: calm ? 'auto' : 'smooth' });
    else el.scrollLeft = left;
  }

  if (!open) return null;

  return (
    <div
      className="welcome"
      role="dialog"
      aria-modal="true"
      aria-label={`Welcome to ${APP_NAME}`}
      onKeyDown={(e) => {
        if (e.key === 'Escape') finish();
        else if (e.key === 'ArrowRight') goTo(index + 1);
        else if (e.key === 'ArrowLeft') goTo(index - 1);
      }}
    >
      <div className="welcome-top">{last ? null : <button type="button" className="welcome-skip" onClick={finish}>Skip</button>}</div>
      <div
        className="welcome-track"
        ref={track}
        onScroll={(e) => {
          const el = e.currentTarget;
          if (el.clientWidth > 0) setIndex(Math.max(0, Math.min(SLIDES.length - 1, Math.round(el.scrollLeft / el.clientWidth))));
        }}
      >
        {SLIDES.map(({ Icon, title, text }, i) => (
          <section key={title} className="welcome-slide" role="group" aria-roledescription="slide" aria-label={`${i + 1} of ${SLIDES.length}`}>
            <span className="welcome-art" aria-hidden="true"><Icon size={56} /></span>
            <h2>{title}</h2>
            <p>{text}</p>
          </section>
        ))}
      </div>
      <div className="welcome-foot">
        <div className="welcome-dots" aria-hidden="true">
          {SLIDES.map((s, i) => <span key={s.title} className={`welcome-dot${i === index ? ' is-on' : ''}`} />)}
        </div>
        <p className="sr-only" aria-live="polite">Slide {index + 1} of {SLIDES.length}</p>
        <button type="button" ref={next} className="btn btn-primary btn-block welcome-next" onClick={() => (last ? finish() : goTo(index + 1))}>
          {last ? 'Get started' : 'Next'}
        </button>
      </div>
    </div>
  );
}
