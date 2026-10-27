// Pictures come from links the admin pastes. A Google Drive share link does not show as a picture by itself
// (it opens a Drive page), so it is turned into Drive's thumbnail address, which does. Any other https link is used as it is.

const DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com']);
const ID_RE = /^[A-Za-z0-9_-]{10,}$/;

/** The id of a Google Drive file in a share link (file/d/ID/view, open?id=ID, uc?id=ID, thumbnail?id=ID), or null. */
export function driveFileId(url: string): string | null {
  let u: URL;
  try {
    u = new URL(url.trim());
  } catch {
    return null;
  }
  if (u.protocol !== 'https:' || !DRIVE_HOSTS.has(u.hostname.toLowerCase())) return null;
  const inPath = /\/(?:file\/(?:u\/\d+\/)?d|d)\/([A-Za-z0-9_-]+)/.exec(u.pathname);
  const id = inPath?.[1] ?? u.searchParams.get('id');
  return id && ID_RE.test(id) ? id : null;
}

/** The address to put in an <img>. `width` is the widest the picture will be shown, in pixels (Drive makes the thumbnail that size).
 *  Nothing, or something that is not an https address, gives null, so the coloured placeholder shows instead. */
export function displayImageUrl(url: string | null | undefined, width = 600): string | null {
  const value = (url ?? '').trim();
  if (!/^https:\/\/\S+$/.test(value)) return null;
  const id = driveFileId(value);
  if (!id) return value;
  const w = Math.min(2000, Math.max(64, Math.round(width)));
  return `https://drive.google.com/thumbnail?id=${id}&sz=w${w}`;
}
