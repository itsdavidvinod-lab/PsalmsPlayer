// The rules the agreement form applies before it asks the database, and how an agreement is described. Pure, so it is tested with the other shared logic.
// The database stays the authority (a verified agreement without proof is refused there too); this gives the admin a clear sentence first.

export type AgreementStatus = 'sent' | 'signed' | 'verified' | 'revoked';

export const AGREEMENT_STATUSES: { value: AgreementStatus; label: string }[] = [
  { value: 'sent', label: 'Sent: waiting for the artist to sign' },
  { value: 'signed', label: 'Signed: document received, not checked yet' },
  { value: 'verified', label: 'Verified: checked against the official mailbox' },
  { value: 'revoked', label: 'Revoked: the artist withdrew it' },
];

/** The rights the site acts on today. Each one switches something on for users. */
export const ENFORCED_RIGHTS = [
  { key: 'allow_lyrics', label: 'Show lyrics', effect: 'Without it, no lyrics are shown for this artist’s songs.' },
  { key: 'allow_chords', label: 'Show chords', effect: 'Without it, chords are stripped from the lyrics.' },
  { key: 'allow_translations', label: 'Show romanized and meaning versions', effect: 'Without it, only the original lyrics are shown.' },
  { key: 'allow_video_embed', label: 'Show the YouTube link', effect: 'Without it, the YouTube link is hidden.' },
  { key: 'allow_audio_hosting', label: 'Host and play the audio recording', effect: 'Without it, songs are lyrics only.' },
] as const;

/** Kept on the record, but nothing in the site reads it yet. */
export const RECORDED_RIGHTS = [{ key: 'allow_photo_bio', label: 'Show the artist’s photo and bio' }] as const;

export type RightKey = (typeof ENFORCED_RIGHTS)[number]['key'] | (typeof RECORDED_RIGHTS)[number]['key'];

export type AgreementInput = {
  status: AgreementStatus;
  starts_on: string;
  expires_on: string;
  document_ref: string;
  revocation_email: string;
  territories: string;
};

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The first problem with the form, as a sentence for the admin, or null when it is fine to send. */
export function validateAgreement(i: AgreementInput): string | null {
  const starts = i.starts_on.trim();
  const expires = i.expires_on.trim();
  if (starts !== '' && !DATE_RE.test(starts)) return 'The start date is not a valid date.';
  if (expires !== '' && !DATE_RE.test(expires)) return 'The end date is not a valid date.';
  if (starts !== '' && expires !== '' && expires < starts) return 'The end date is before the start date.';
  if (i.document_ref.trim().length > 300) return 'The document reference is too long (300 characters at most).';
  const email = i.revocation_email.trim();
  if (email !== '' && (!EMAIL_RE.test(email) || email.length > 200)) return 'The withdrawal email address does not look like an email address.';
  const t = parseTerritories(i.territories);
  if (!t.ok) return t.reason;
  if (i.status === 'verified') {
    if (i.document_ref.trim() === '') return 'A verified agreement needs the document reference: the message or file name of the signed agreement in the official mailbox.';
    if (starts === '' || expires === '') return 'A verified agreement needs both a start date and an end date.';
  }
  return null;
}

/** "IN, lk" becomes ["IN", "LK"]. Region codes such as IN-TN are allowed. Duplicates are dropped. */
export function parseTerritories(text: string): { ok: true; value: string[] } | { ok: false; reason: string } {
  const parts = text.split(/[\s,;]+/).map((p) => p.trim().toUpperCase()).filter((p) => p !== '');
  const seen: string[] = [];
  for (const p of parts) {
    if (!/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(p)) return { ok: false, reason: `"${p}" is not a country or region code. Use codes such as IN or LK, separated by commas.` };
    if (!seen.includes(p)) seen.push(p);
  }
  if (seen.length > 30) return { ok: false, reason: 'Too many territories (30 at most).' };
  return { ok: true, value: seen };
}

export type Stamps = { sent_at: string | null; signed_at: string | null; verified_at: string | null; verified_by: string | null };

/** Which "when" and "who" fields go with a status. Earlier stamps are kept; going back from verified clears the verification, so a record never claims a check that was withdrawn. */
export function stampsFor(prev: Stamps | null, status: AgreementStatus, adminId: string, nowIso: string): Stamps {
  const sent_at = prev?.sent_at ?? nowIso;
  const signed_at = status === 'sent' ? (prev?.signed_at ?? null) : (prev?.signed_at ?? nowIso);
  if (status === 'verified') {
    return { sent_at, signed_at, verified_at: prev?.verified_at ?? nowIso, verified_by: prev?.verified_by ?? adminId };
  }
  if (status === 'revoked') {
    return { sent_at, signed_at: prev?.signed_at ?? null, verified_at: prev?.verified_at ?? null, verified_by: prev?.verified_by ?? null };
  }
  return { sent_at, signed_at, verified_at: null, verified_by: null };
}

export type AgreementPhase = 'in_force' | 'expired' | 'not_started' | 'not_verified' | 'revoked';

export function agreementPhase(a: { status: string; starts_on: string | null; expires_on: string | null }, today: string): AgreementPhase {
  if (a.status === 'revoked') return 'revoked';
  if (a.status !== 'verified' || a.starts_on === null || a.expires_on === null) return 'not_verified';
  if (a.expires_on < today) return 'expired';
  if (a.starts_on > today) return 'not_started';
  return 'in_force';
}

const PHASE_LABEL: Record<AgreementPhase, string> = {
  in_force: 'In force',
  expired: 'Expired',
  not_started: 'Not started yet',
  not_verified: 'Not verified yet',
  revoked: 'Revoked',
};
export function phaseLabel(p: AgreementPhase): string {
  return PHASE_LABEL[p];
}

/** One line describing an agreement in a list: "Verified · 2026-01-01 to 2026-12-31 · In force". */
export function agreementSummary(a: { status: string; starts_on: string | null; expires_on: string | null }, today: string): string {
  const status = AGREEMENT_STATUSES.find((s) => s.value === a.status)?.label.split(':')[0] ?? a.status;
  const term = a.starts_on && a.expires_on ? `${a.starts_on} to ${a.expires_on}` : 'no term set';
  return `${status} · ${term} · ${phaseLabel(agreementPhase(a, today))}`;
}
