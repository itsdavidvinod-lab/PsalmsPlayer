'use client';

// The notices and events at the top of Home: pictures only. A picture with a YouTube link opens it (in YouTube) when tapped.
// The strip scrolls sideways with a swipe, moves on by itself every few seconds, goes back to the first after the last,
// and holds still while a finger, the mouse or the keyboard is on it, and for people who asked their device for less motion.

import { useCallback, useEffect, useRef, useState } from 'react';
import { nextSlide, slideFromScroll } from '@/lib/carousel';

export type PosterSlide = { id: string; title: string; image: string | null; href: string | null };

const ADVANCE_MS = 5000;
const HOLD_AFTER_TOUCH_MS = 6000;

function reducedMotion(): boolean {
  return typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** The picture of one slide. When the link is missing, or the picture cannot be loaded (a Google Drive file that is not shared
 *  with "anyone with the link" fails for everyone except its owner), the poster's title on a plain background is shown
 *  instead of the browser's broken-picture icon. */
function PosterPicture({ image, title }: { image: string | null; title: string }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [image]);
  if (!image || failed) return <span className="poster-blank">{title}</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={image} alt="" loading="lazy" draggable={false} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  );
}

export default function PosterCarousel({ slides }: { slides: PosterSlide[] }) {
  const track = useRef<HTMLUListElement>(null);
  const [active, setActive] = useState(0);
  const activeRef = useRef(0);
  const holdUntil = useRef(0);
  const resting = useRef(false); // pointer over the strip, or focus inside it

  const goTo = useCallback((index: number) => {
    const el = track.current;
    const slide = el?.children[index] as HTMLElement | undefined;
    if (!el || !slide) return;
    el.scrollTo({ left: slide.offsetLeft, behavior: reducedMotion() ? 'auto' : 'smooth' });
  }, []);

  useEffect(() => {
    if (slides.length < 2 || reducedMotion()) return;
    const timer = window.setInterval(() => {
      if (resting.current || document.hidden || Date.now() < holdUntil.current) return;
      goTo(nextSlide(activeRef.current, slides.length));
    }, ADVANCE_MS);
    return () => window.clearInterval(timer);
  }, [slides.length, goTo]);

  function onScroll() {
    const el = track.current;
    const first = el?.children[0] as HTMLElement | undefined;
    if (!el || !first) return;
    const second = el.children[1] as HTMLElement | undefined;
    const pitch = second ? second.offsetLeft - first.offsetLeft : el.clientWidth;
    const index = slideFromScroll(el.scrollLeft, pitch, slides.length);
    if (index !== activeRef.current) {
      activeRef.current = index;
      setActive(index);
    }
  }

  function hold() {
    holdUntil.current = Date.now() + HOLD_AFTER_TOUCH_MS;
  }

  if (slides.length === 0) return null;
  return (
    <div className="poster-wrap">
      <ul
        ref={track}
        className="poster-track"
        onScroll={onScroll}
        onTouchStart={hold}
        onWheel={hold}
        onPointerDown={hold}
        onMouseEnter={() => { resting.current = true; }}
        onMouseLeave={() => { resting.current = false; }}
        onFocus={() => { resting.current = true; }}
        onBlur={() => { resting.current = false; }}
      >
        {slides.map((s) => {
          const picture = <PosterPicture image={s.image} title={s.title} />;
          return (
            <li key={s.id} className="poster-slide" role="group" aria-roledescription="slide" aria-label={s.title}>
              {s.href ? (
                <a href={s.href} target="_blank" rel="noopener noreferrer" className="poster-link" aria-label={`${s.title}. Opens YouTube.`}>
                  {picture}
                </a>
              ) : (
                picture
              )}
            </li>
          );
        })}
      </ul>
      {slides.length > 1 ? (
        <div className="poster-dots" aria-hidden="true">
          {slides.map((s, i) => (
            <span key={s.id} className={i === active ? 'poster-dot poster-dot-on' : 'poster-dot'} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
