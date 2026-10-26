// Rules for the requests ledger and posters in the admin site: money, India-time windows, and what a request must have before its poster can go live.
// Pure, so it is tested with the other shared logic. The database stays the authority (see guard_poster_approval in 0002).

export type RequestKind = 'promotion' | 'songs';
export type RequestChannel = 'whatsapp' | 'email';
export type RequestStatus = 'in_discussion' | 'agreed' | 'awaiting_payment' | 'paid' | 'live' | 'completed' | 'refunded' | 'cancelled';

export const REQUEST_KINDS: { value: RequestKind; label: string }[] = [
  { value: 'promotion', label: 'Promotion (a poster on Home)' },
  { value: 'songs', label: 'Songs (adding an artist’s songs)' },
];
export const REQUEST_CHANNELS: { value: RequestChannel; label: string }[] = [
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'email', label: 'Email' },
];
export const REQUEST_STATUSES: { value: RequestStatus; label: string }[] = [
  { value: 'in_discussion', label: 'In discussion' },
  { value: 'agreed', label: 'Agreed' },
  { value: 'awaiting_payment', label: 'Awaiting payment' },
  { value: 'paid', label: 'Paid' },
  { value: 'live', label: 'Live' },
  { value: 'completed', label: 'Completed' },
  { value: 'refunded', label: 'Refunded' },
  { value: 'cancelled', label: 'Cancelled' },
];
export function requestStatusLabel(status: string): string {
  return REQUEST_STATUSES.find((s) => s.value === status)?.label ?? status;
}

// ---------------------------------------------------------------- money
const MAX_PAISE = 100_000_000_000; // ₹100 crore: far above anything real, and well inside what a bigint and a JS number both hold exactly.

/** "1500", "1,500.5" or "₹ 1500.50" become 150000, 150050, 150050. Empty means "not recorded" (null). Never goes through floating point. */
export function rupeesToPaise(text: string): { ok: true; value: number | null } | { ok: false } {
  const t = text.replace(/[₹,\s]/g, '');
  if (t === '') return { ok: true, value: null };
  const m = /^(\d{1,12})(?:\.(\d{1,2}))?$/.exec(t);
  if (!m) return { ok: false };
  const paise = Number(m[1]) * 100 + Number((m[2] ?? '').padEnd(2, '0') || '0');
  return paise <= MAX_PAISE ? { ok: true, value: paise } : { ok: false };
}

/** 150050 becomes "₹1,500.50" with Indian digit grouping. */
export function paiseToRupees(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return 'not recorded';
  return `₹${new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(paise / 100)}`;
}

/** The text that goes back into the amount box: "1500.50", or "" when nothing is recorded. */
export function paiseToInput(paise: number | null | undefined): string {
  if (paise === null || paise === undefined) return '';
  const whole = Math.floor(paise / 100);
  const frac = paise % 100;
  return frac === 0 ? String(whole) : `${whole}.${String(frac).padStart(2, '0')}`;
}

// ---------------------------------------------------------------- India time
/** A "datetime-local" box value such as 2026-11-01T09:00, read as India time, as the ISO string the database stores. Empty gives null. */
export function istInputToIso(local: string): string | null {
  const t = local.trim();
  if (t === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(t)) return null;
  const ms = Date.parse(`${t}:00+05:30`);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/** The reverse: a stored moment shown in a "datetime-local" box in India time. */
export function isoToIstInput(iso: string | null | undefined): string {
  if (!iso) return '';
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return '';
  const ist = new Date(ms + 5.5 * 3600 * 1000);
  return ist.toISOString().slice(0, 16);
}

// ---------------------------------------------------------------- requests
export type RequestInput = {
  kind: RequestKind;
  channel: RequestChannel;
  contact: string;
  status: RequestStatus;
  amount: string;
  refund: string;
  refund_reason: string;
  paid_on: string; // YYYY-MM-DD or empty
};

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The first problem with a request form, as a sentence, or null. */
export function validateRequest(i: RequestInput): string | null {
  const contact = i.contact.trim();
  if (contact === '') return 'The contact is required: the WhatsApp number or email address the request came from.';
  if (i.channel === 'email' && (!EMAIL_RE.test(contact) || contact.length > 200)) return 'That does not look like an email address.';
  if (i.channel === 'whatsapp' && !/^\+?\d{8,15}$/.test(contact.replace(/[\s-]/g, ''))) return 'A WhatsApp number has 8 to 15 digits, with the country code, for example +919876543210.';
  const amount = rupeesToPaise(i.amount);
  if (!amount.ok) return 'The amount is not a valid number of rupees (for example 1500 or 1500.50).';
  const refund = rupeesToPaise(i.refund);
  if (!refund.ok) return 'The refund is not a valid number of rupees.';
  if (i.paid_on !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(i.paid_on)) return 'The payment date is not a valid date.';
  if (['paid', 'live', 'completed'].includes(i.status)) {
    if (amount.value === null || amount.value <= 0) return 'A paid request needs the amount that was paid.';
    if (i.paid_on === '') return 'A paid request needs the date it was paid.';
  }
  if (i.status === 'refunded') {
    if (refund.value === null || refund.value <= 0) return 'A refunded request needs the amount refunded.';
    if (i.refund_reason.trim() === '') return 'A refunded request needs the reason.';
  }
  if (refund.value !== null && refund.value > 0) {
    if (amount.value === null) return 'Record the amount paid before recording a refund.';
    if (refund.value > amount.value) return 'The refund is more than the amount paid.';
  }
  if (i.refund_reason.length > 500) return 'The refund reason is too long (500 characters at most).';
  return null;
}

/** "paid_at" is stored as a moment; the form asks for the day, read at the start of that day in India. */
export function paidOnToIso(day: string): string | null {
  return day === '' ? null : istInputToIso(`${day}T00:00`);
}
export function isoToPaidOn(iso: string | null | undefined): string {
  return isoToIstInput(iso).slice(0, 10);
}

// ---------------------------------------------------------------- posters
export type PosterKind = 'event' | 'release' | 'notice';
export type PosterStatus = 'draft' | 'approved' | 'paused' | 'refunded';
export type MatchMode = 'everyone' | 'either' | 'both';

export const POSTER_KINDS: { value: PosterKind; label: string }[] = [
  { value: 'event', label: 'Event' },
  { value: 'release', label: 'New release' },
  { value: 'notice', label: 'Notice' },
];
export const POSTER_STATUSES: { value: PosterStatus; label: string }[] = [
  { value: 'draft', label: 'Draft: not shown' },
  { value: 'approved', label: 'Approved: shown inside its dates' },
  { value: 'paused', label: 'Paused: not shown' },
  { value: 'refunded', label: 'Refunded: not shown' },
];
export const MATCH_MODES: { value: MatchMode; label: string; hint: string }[] = [
  { value: 'everyone', label: 'Everyone', hint: 'Shown to all users, whatever their language or region.' },
  { value: 'either', label: 'Language or region', hint: 'Shown to users who match at least one of the chosen languages or regions.' },
  { value: 'both', label: 'Language and region', hint: 'Shown only to users who match a chosen language and a chosen region.' },
];

export type PosterInput = {
  status: PosterStatus;
  title: string;
  image_url: string;
  youtube: string; // already reduced to an id or ''
  match_mode: MatchMode;
  languages: string[];
  regions: string[];
  event_date: string;
  starts_local: string;
  ends_local: string;
  request_id: string;
};

/** What the request behind a poster must have before the poster can be approved (the database enforces the same rule). */
export function requestAllowsApproval(r: { contact_verified: boolean; amount_paise: number | null } | null): { ok: boolean; reason: string } {
  if (!r) return { ok: false, reason: 'Link the poster to the request it came from first.' };
  if (!r.contact_verified) return { ok: false, reason: 'The request’s contact is not verified yet. Verify the requester first.' };
  if (r.amount_paise === null) return { ok: false, reason: 'The request has no amount recorded yet.' };
  return { ok: true, reason: '' };
}

/** The first problem with a poster form, or null. `request` is the linked request when there is one. */
export function validatePoster(i: PosterInput, request: { contact_verified: boolean; amount_paise: number | null } | null): string | null {
  if (i.title.trim() === '') return 'The title is required.';
  if (i.title.length > 120) return 'The title is too long (120 characters at most).';
  if (!/^https:\/\/[^\s]+$/.test(i.image_url.trim())) return 'The image address must start with https://';
  const starts = i.starts_local === '' ? null : istInputToIso(i.starts_local);
  const ends = i.ends_local === '' ? null : istInputToIso(i.ends_local);
  if (i.starts_local !== '' && starts === null) return 'The start is not a valid date and time.';
  if (i.ends_local !== '' && ends === null) return 'The end is not a valid date and time.';
  if (starts !== null && ends !== null && ends <= starts) return 'The end must be after the start.';
  if (i.event_date !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(i.event_date)) return 'The event date is not a valid date.';
  if (i.match_mode === 'both' && (i.languages.length === 0 || i.regions.length === 0)) return '"Language and region" needs at least one language and at least one region.';
  if (i.match_mode === 'either' && i.languages.length === 0 && i.regions.length === 0) return '"Language or region" needs at least one language or region.';
  if (i.status === 'approved') {
    if (starts === null || ends === null) return 'An approved poster needs a start and an end, so it knows when to appear and when to stop.';
    const ok = requestAllowsApproval(request);
    if (!ok.ok) return ok.reason;
  }
  return null;
}

/** Where a poster is in its life. Mirrors home_posters(): shown from its start until its end or the end of the event day (India time), whichever is first. */
export function posterPhase(
  p: { status: string; starts_at: string | null; ends_at: string | null; event_date: string | null },
  nowMs: number,
): 'showing' | 'scheduled' | 'ended' | 'off' {
  if (p.status !== 'approved' || !p.starts_at || !p.ends_at) return 'off';
  const start = Date.parse(p.starts_at);
  let end = Date.parse(p.ends_at);
  if (p.event_date) {
    const eventEnd = Date.parse(`${p.event_date}T00:00:00+05:30`) + 24 * 3600 * 1000;
    if (!Number.isNaN(eventEnd)) end = Math.min(end, eventEnd);
  }
  if (nowMs < start) return 'scheduled';
  if (nowMs >= end) return 'ended';
  return 'showing';
}
