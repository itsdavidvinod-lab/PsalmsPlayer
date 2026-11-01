// An artist's YouTube channel: reading what the admin pastes, and the address behind the "Subscribe" link.
// The database accepts only https://youtube.com/(@name | channel/ID | c/name | user/name) (migration 0019); this turns the many ways
// people copy a channel address into that one shape.

export type ChannelResult = { ok: true; value: string | null } | { ok: false; reason: string };

const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com']);
const NOT_A_CHANNEL = 'That is not a YouTube channel address. Open the channel in YouTube and copy its address; it looks like youtube.com/@name.';

/** Empty means "no channel". "@name", "youtube.com/@name/videos" and "https://www.youtube.com/channel/UC…?si=…" all become a clean https address. */
export function normalizeChannelUrl(input: string): ChannelResult {
  const text = input.trim();
  if (text === '') return { ok: true, value: null };
  const withScheme = text.startsWith('@') ? `https://www.youtube.com/${text}` : /^https?:\/\//i.test(text) ? text : `https://${text}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return { ok: false, reason: NOT_A_CHANNEL };
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return { ok: false, reason: NOT_A_CHANNEL };
  if (!HOSTS.has(url.hostname.toLowerCase())) return { ok: false, reason: NOT_A_CHANNEL };
  const parts = url.pathname.split('/').filter((p) => p !== '');
  const [first, second] = parts;
  let path: string | null = null;
  if (first && first.startsWith('@') && first.length > 1) path = `/${first}`;
  else if (first && ['channel', 'c', 'user'].includes(first.toLowerCase()) && second) path = `/${first.toLowerCase()}/${second}`;
  if (path === null) return { ok: false, reason: NOT_A_CHANNEL };
  return { ok: true, value: `https://www.youtube.com${path}` };
}

/** The address behind the Subscribe link: the channel, asking YouTube to offer the Subscribe button on arrival. */
export function subscribeHref(channelUrl: string): string {
  return `${channelUrl.replace(/\/$/, '')}?sub_confirmation=1`;
}
