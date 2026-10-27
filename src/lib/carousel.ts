// The small arithmetic behind the poster carousel on Home.

/** The slide after `index`, going back to the first after the last. */
export function nextSlide(index: number, count: number): number {
  if (count <= 0) return 0;
  return (index + 1) % count;
}

/** Which slide is showing, from how far the strip has been scrolled and how far apart the slides start. */
export function slideFromScroll(scrollLeft: number, pitch: number, count: number): number {
  if (count <= 0 || !(pitch > 0)) return 0;
  return Math.min(count - 1, Math.max(0, Math.round(scrollLeft / pitch)));
}
