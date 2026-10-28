// Pictures an admin uploads from their own device: what is accepted, how big they end up, and what they are called in storage.
// The browser shrinks the picture first (see the admin PictureField), so the files kept are small and the site stays fast.

export type PictureKind = 'artist' | 'album' | 'song' | 'poster';

/** The widest a stored picture is, in pixels. Posters are wide banners on Home; everything else is shown small. */
export const PICTURE_MAX_WIDTH: Record<PictureKind, number> = { artist: 800, album: 800, song: 800, poster: 1400 };

/** Largest file taken from the admin's device, before it is shrunk. */
export const PICTURE_SOURCE_MAX_BYTES = 20 * 1024 * 1024;
/** Largest file kept in storage (the bucket enforces the same number). */
export const PICTURE_STORED_MAX_BYTES = 2 * 1024 * 1024;
export const PICTURE_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export const PICTURE_BUCKET = 'pictures';

export type PictureCheck = { ok: true } | { ok: false; text: string };

/** Is this file one we will shrink and upload? Judged from what the browser reports, before reading it. */
export function checkPictureFile(file: { type: string; size: number }): PictureCheck {
  if (!(PICTURE_TYPES as readonly string[]).includes(file.type)) return { ok: false, text: 'Choose a JPG, PNG or WebP picture.' };
  if (file.size <= 0) return { ok: false, text: 'That file is empty.' };
  if (file.size > PICTURE_SOURCE_MAX_BYTES) return { ok: false, text: 'That picture is larger than 20 MB. Choose a smaller one.' };
  return { ok: true };
}

/** The size a picture is drawn at: never larger than it is, never wider than `maxWidth`, same shape, whole pixels, at least 1. */
export function fitWithin(width: number, height: number, maxWidth: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: 1, height: 1 };
  if (width <= maxWidth) return { width: Math.round(width), height: Math.round(height) };
  const scale = maxWidth / width;
  return { width: maxWidth, height: Math.max(1, Math.round(height * scale)) };
}

/** Where a picture is kept: `<kind>/<random id>.<webp|jpg>`. A new name every time, so a replaced picture is never served stale. */
export function pictureObjectName(kind: PictureKind, id: string, mime: string): string {
  const ext = mime === 'image/webp' ? 'webp' : mime === 'image/png' ? 'png' : 'jpg';
  return `${kind}/${id}.${ext}`;
}
