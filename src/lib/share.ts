// Share links for a song. Two choices, matching the Share sheet:
//   "app"  → a page on our own domain that sends the visitor to the Play Store / App Store and remembers which song
//   "web"  → the web login page, which returns to the song after sign-in
// Lyrics stay behind login either way.

export type ShareKind = 'app' | 'web';

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

export function buildShareUrl(kind: ShareKind, songSlug: string, origin: string): string {
  if (!SLUG_RE.test(songSlug)) throw new Error('Invalid song slug');
  const base = new URL(origin);
  if (kind === 'app') {
    const u = new URL('/get', base);
    u.searchParams.set('song', songSlug);
    return u.toString();
  }
  const u = new URL('/login', base);
  u.searchParams.set('next', `/song/${songSlug}`);
  return u.toString();
}

export function shareMessage(title: string, url: string): string {
  return `${title}\n${url}`;
}

/** Only allows redirects to a path on this site, so a crafted ?next= cannot send people to another domain. */
export function safeNextPath(next: string | null | undefined, fallback = '/'): string {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.includes('\\')) return fallback;
  return next;
}
