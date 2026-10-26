// Remembers the short-lived links to audio files, so skipping around a queue does not ask the server every time.
// A link is issued for one hour; this cache stops reusing it after 50 minutes, so a song never starts on a link about to die.
// Failures are never cached: the next request asks again.

export const URL_TTL_MS = 50 * 60 * 1000;

type Entry = { url: string; at: number };

export class SignedUrlCache {
  private readonly fetchUrl: (songId: string) => Promise<string | null>;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly done = new Map<string, Entry>();
  private readonly pending = new Map<string, Promise<string | null>>();

  constructor(fetchUrl: (songId: string) => Promise<string | null>, now: () => number = () => Date.now(), ttlMs: number = URL_TTL_MS) {
    this.fetchUrl = fetchUrl;
    this.now = now;
    this.ttlMs = ttlMs;
  }

  /** A usable link for the song, or null when the server refused or could not be reached. */
  get(songId: string): Promise<string | null> {
    const hit = this.done.get(songId);
    if (hit && this.now() - hit.at < this.ttlMs) return Promise.resolve(hit.url);
    const inflight = this.pending.get(songId);
    if (inflight) return inflight;

    const request = this.fetchUrl(songId)
      .catch(() => null)
      .then((url) => {
        this.pending.delete(songId);
        if (url) this.done.set(songId, { url, at: this.now() });
        else this.done.delete(songId);
        return url;
      });
    this.pending.set(songId, request);
    return request;
  }

  /** Forget the link, for example after the browser reports that it no longer works. */
  invalidate(songId: string): void {
    this.done.delete(songId);
  }
}
