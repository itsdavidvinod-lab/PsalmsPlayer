// A person's own profile picture: what is accepted, how it is stored, and which picture is shown.
// The browser cuts it to a small square first (see shrink-picture.ts), so the files kept are tiny. The "avatars" bucket allows a
// person to work only in the folder named after them; the database also refuses any address that is not in that folder.

export const AVATAR_BUCKET = 'avatars';
/** Pixels on each side of the stored square. Shown at most about 64 px wide, so this stays sharp on a dense screen. */
export const AVATAR_SIZE = 256;
/** The most the bucket keeps (the same number is its own limit). */
export const AVATAR_STORED_MAX_BYTES = 512 * 1024;
/** The most taken from the phone, before it is shrunk. */
export const AVATAR_SOURCE_MAX_BYTES = 20 * 1024 * 1024;
export const AVATAR_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export type AvatarCheck = { ok: true } | { ok: false; text: string };

/** Is this file one we will shrink and upload? Judged from what the browser reports, before reading it. */
export function checkAvatarFile(file: { type: string; size: number }): AvatarCheck {
  if (!(AVATAR_TYPES as readonly string[]).includes(file.type)) return { ok: false, text: 'Choose a JPG, PNG or WebP picture.' };
  if (file.size <= 0) return { ok: false, text: 'That file is empty.' };
  if (file.size > AVATAR_SOURCE_MAX_BYTES) return { ok: false, text: 'That picture is larger than 20 MB. Choose a smaller one.' };
  return { ok: true };
}

/** Where a picture is kept: `<person id>/<random id>.<webp|png|jpg>`. A new name every time, so a replaced picture is never served stale. */
export function avatarObjectName(userId: string, id: string, mime: string): string {
  const ext = mime === 'image/webp' ? 'webp' : mime === 'image/png' ? 'png' : 'jpg';
  return `${userId}/${id}.${ext}`;
}

/** The file name inside the bucket for a stored picture's address, when that address is one of this person's own pictures. Otherwise null. */
export function avatarPathFromUrl(url: string | null | undefined, userId: string): string | null {
  if (!url) return null;
  let u: URL;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`;
  const at = u.pathname.indexOf(marker);
  if (u.protocol !== 'https:' || at < 0) return null;
  const path = decodeURIComponent(u.pathname.slice(at + marker.length));
  const [folder, file, ...rest] = path.split('/');
  return folder === userId && file && rest.length === 0 ? path : null;
}
