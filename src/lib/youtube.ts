// Pulls the 11-character video id out of whatever an admin pastes. Matches the check on songs.youtube_id in the database.

const ID_RE = /^[A-Za-z0-9_-]{11}$/;
const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtube-nocookie.com', 'www.youtube-nocookie.com']);

export function extractYoutubeId(input: string): string | null {
  const value = input.trim();
  if (ID_RE.test(value)) return value;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(value) ? value : 'https://' + value);
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (HOSTS.has(host)) {
    if (url.pathname === '/watch') id = url.searchParams.get('v');
    else {
      const [, kind, maybeId] = url.pathname.split('/');
      if (kind === 'embed' || kind === 'shorts' || kind === 'live' || kind === 'v') id = maybeId ?? null;
    }
  }
  return id && ID_RE.test(id) ? id : null;
}

/** Address of the embeddable player. Uses the privacy-friendly domain and keeps related videos to the same channel.
 *  enablejsapi lets the site learn whether the video is playing, which is how listening time is measured. */
export function youtubeEmbedUrl(id: string): string {
  if (!ID_RE.test(id)) throw new Error('Invalid YouTube id');
  return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1&enablejsapi=1`;
}
