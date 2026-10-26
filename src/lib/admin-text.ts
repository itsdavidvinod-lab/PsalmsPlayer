// Plain helpers for the admin site. No dependencies, so they are tested with the other shared logic.

const REASONS: Record<string, string> = {
  live: 'Live',
  missing: 'Song not found',
  taken_down: 'Taken down by an admin',
  not_published: 'Not published yet',
  artist_not_published: 'The artist is not published',
  agreement_inactive: 'No verified agreement in force',
  no_writer: 'No writer credited',
  consent_missing: 'A writer or owner has not given consent',
  consent_expired: 'A consent has expired',
};

/** The words an admin sees for the code returned by admin_song_visibility(). */
export function visibilityLabel(code: string | null | undefined): string {
  if (!code) return 'Unknown';
  return REASONS[code] ?? code;
}

/** "Grace Worship Team" becomes "grace-worship-team". Names with no Latin letters give an empty string: the admin types the address. */
export function slugify(text: string): string {
  return text
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}

const SLUG_RE = /^[a-z0-9]+(-[a-z0-9]+)*$/;

/** The same rule as the slug check in the database, plus a length limit. */
export function isValidSlug(value: string): boolean {
  return value.length > 0 && value.length <= 80 && SLUG_RE.test(value);
}

/** Pictures must come from a secure web address. Nothing else (data:, javascript:, http:) is accepted. */
export function isHttpsUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === 'https:' && url.hostname.includes('.');
  } catch {
    return false;
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** An optional whole number from a text box: empty means "none", anything else must be an integer inside the limits. */
export function parseOptionalInt(value: string, min: number, max: number): { ok: true; value: number | null } | { ok: false } {
  const v = value.trim();
  if (v === '') return { ok: true, value: null };
  if (!/^-?\d+$/.test(v)) return { ok: false };
  const n = Number(v);
  return n >= min && n <= max ? { ok: true, value: n } : { ok: false };
}

/** "12 days left", "Expires today", "Expired 3 days ago" or "No agreement" when there is none in force. */
export function daysLeftLabel(days: number | null | undefined): string {
  if (days === null || days === undefined) return 'No agreement in force';
  if (days < 0) return `Expired ${-days} ${-days === 1 ? 'day' : 'days'} ago`;
  if (days === 0) return 'Expires today';
  return `${days} ${days === 1 ? 'day' : 'days'} left`;
}

export type AdminError = { code?: string | null; message?: string | null };

/** A readable message for a failed save. Admins see the database's own wording for rule violations, because it names the rule. */
export function explainAdminError(error: AdminError): string {
  switch (error.code) {
    case '23505':
      return 'Another record already uses this value (usually the address). Choose a different one.';
    case '23514':
      return `The database refused this: ${error.message ?? 'a rule was broken'}.`;
    case '23503':
      return 'A linked item does not exist any more. Refresh the page and try again.';
    case '42501':
      return 'Not allowed. Sign in again as an admin.';
    default:
      return `Could not save${error.message ? `: ${error.message}` : ''}.`;
  }
}

const HINTS: Record<string, string> = {
  taken_down: 'Switch off "Taken down" below to bring it back.',
  not_published: 'Tick "Published" below when the song is ready.',
  artist_not_published: 'Publish the artist first.',
  agreement_inactive: 'The artist needs a verified agreement that is in date.',
  no_writer: 'Add a writer under Credits.',
  consent_missing: 'Every writer and owner needs consent marked as granted under Credits.',
  consent_expired: 'A consent date has passed. Renew it under Credits.',
};

/** What to do about a hidden song. Empty for a live song. */
export function visibilityHint(code: string | null | undefined): string {
  return code ? HINTS[code] ?? '' : '';
}

const YOUTUBE_LABELS: Record<string, string> = {
  unchecked: 'Not checked yet',
  ok: 'OK: shown to users',
  channel_mismatch: 'Wrong channel: hidden from users',
  not_embeddable: 'Cannot be embedded: still shown as a link',
  missing: 'Video is gone: hidden from users',
};

export function youtubeStatusLabel(status: string): string {
  return YOUTUBE_LABELS[status] ?? status;
}

/** The song key choices in the order a picker shows them: major keys, then minor keys, spelled the usual way. */
export const KEY_CHOICES: string[] = [
  'C', 'C#', 'D', 'Eb', 'E', 'F', 'F#', 'G', 'Ab', 'A', 'Bb', 'B',
  'Am', 'A#m', 'Bm', 'Cm', 'C#m', 'Dm', 'D#m', 'Em', 'Fm', 'F#m', 'Gm', 'G#m',
];

/** The same key shape the database accepts for a song or a setlist item. */
export function isMusicalKey(value: string): boolean {
  return /^[A-G][#b]?m?$/.test(value);
}

export const CREDIT_ROLES = [
  { value: 'writer', label: 'Writer' },
  { value: 'owner', label: 'Owner' },
  { value: 'performer', label: 'Performer' },
  { value: 'translator', label: 'Translator' },
] as const;

export const CONSENT_STATUSES = [
  { value: 'pending', label: 'Pending' },
  { value: 'granted', label: 'Granted' },
  { value: 'revoked', label: 'Revoked' },
] as const;
