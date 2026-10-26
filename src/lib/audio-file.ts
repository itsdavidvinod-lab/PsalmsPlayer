// Which audio files the admin site accepts, and what they are called in storage. Pure, so it is tested with the other shared logic.
import { slugify } from './admin-text.ts';

/** The free Supabase plan refuses files over 50 MB. On a paid plan raise this number (the bucket itself allows 100 MB). */
export const AUDIO_MAX_BYTES = 50 * 1024 * 1024;

export type AudioMime = 'audio/mpeg' | 'audio/mp4' | 'audio/aac';
export type AudioCheck = { ok: true; mime: AudioMime; ext: string } | { ok: false; reason: string };

// One decision, in one place: MP3 and AAC (in an M4A container or as raw AAC) play everywhere our listeners are
// (iPhone, Android, desktop browsers, lock screens). Other formats must be converted before they are uploaded.
const BY_EXTENSION: Record<string, AudioMime> = { mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac' };
const ACCEPTED_BROWSER_TYPES = new Set(['', 'audio/mpeg', 'audio/mp3', 'audio/mp4', 'audio/x-m4a', 'audio/m4a', 'audio/aac', 'audio/x-aac']);

function megabytes(bytes: number): string {
  return (bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0);
}

export function checkAudioFile(file: { name: string; type: string; size: number }, maxBytes: number = AUDIO_MAX_BYTES): AudioCheck {
  const dot = file.name.lastIndexOf('.');
  const ext = dot >= 0 ? file.name.slice(dot + 1).toLowerCase() : '';
  const mime = BY_EXTENSION[ext];
  if (!mime) return { ok: false, reason: 'Only MP3 and M4A/AAC files are accepted. Convert other formats (WAV, FLAC, OGG and so on) before uploading.' };
  if (!ACCEPTED_BROWSER_TYPES.has(file.type.toLowerCase())) {
    return { ok: false, reason: `This file says it is ${file.type}, which does not match its .${ext} name. Export it again as a real ${ext.toUpperCase()}.` };
  }
  if (file.size <= 0) return { ok: false, reason: 'This file is empty.' };
  if (file.size > maxBytes) return { ok: false, reason: `This file is ${megabytes(file.size)} MB. The limit is ${megabytes(maxBytes)} MB.` };
  return { ok: true, mime, ext };
}

/** A storage name that is safe in an address and never repeats, so a replaced file is never served from an old cache. */
export function audioObjectName(originalName: string, ext: string, nowMs: number): string {
  const dot = originalName.lastIndexOf('.');
  const base = slugify(dot >= 0 ? originalName.slice(0, dot) : originalName).slice(0, 60).replace(/-+$/g, '') || 'audio';
  return `${base}-${nowMs.toString(36)}.${ext}`;
}

export type AgreementTerms = { status: string; starts_on: string | null; expires_on: string | null; allow_audio_hosting: boolean };

/** Whether an agreement in force today lets the file be played. Dates are YYYY-MM-DD and valid through the end of that day. */
export function audioHostingState(agreements: AgreementTerms[], today: string): { ok: boolean; reason: string } {
  const inForce = agreements.filter((a) => a.status === 'verified' && a.starts_on !== null && a.expires_on !== null && a.starts_on <= today && a.expires_on >= today);
  if (inForce.length === 0) return { ok: false, reason: 'No verified agreement is in force for this artist.' };
  if (!inForce.some((a) => a.allow_audio_hosting)) return { ok: false, reason: 'The agreement in force does not allow audio hosting.' };
  return { ok: true, reason: 'The agreement in force allows audio hosting.' };
}

/** The length of a recording as the whole seconds the database stores, or null when the browser could not read it. */
export function durationSeconds(raw: number): number | null {
  if (!Number.isFinite(raw) || raw <= 0) return null;
  const whole = Math.round(raw);
  return whole >= 1 && whole <= 24 * 3600 ? whole : null;
}

/** The file name an admin recognises: the stored name without its folder. */
export function audioDisplayName(path: string): string {
  const slash = path.lastIndexOf('/');
  return slash >= 0 ? path.slice(slash + 1) : path;
}

/** "3:07" for a length in seconds. */
export function mmss(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, '0')}`;
}

export function sizeLabel(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${megabytes(bytes)} MB`;
}

/** Today's date (YYYY-MM-DD) in India, which is how the database reads "valid through the end of that day". */
export function indiaToday(now: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
