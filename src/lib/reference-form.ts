// Rules the Lists page applies before it asks the database (the database enforces the same shapes, see 0011), and how its errors read.
import { explainAdminError, slugify, type AdminError } from './admin-text.ts';

export type TagKind = 'genre' | 'occasion' | 'mood';
export const TAG_KINDS: { kind: TagKind; heading: string; single: string }[] = [
  { kind: 'genre', heading: 'Genres', single: 'genre' },
  { kind: 'occasion', heading: 'Occasions', single: 'occasion' },
  { kind: 'mood', heading: 'Moods', single: 'mood' },
];

export const normalizeLanguageCode = (code: string): string => code.trim().toLowerCase();
export const normalizeRegionCode = (code: string): string => code.trim().toUpperCase();

/** "IN-TN" belongs to "IN"; "IN" to itself. */
export function regionCountry(code: string): string {
  return normalizeRegionCode(code).split('-')[0];
}

/** A code for a new genre, occasion or mood, suggested from its label. Empty when the label has no Latin letters or digits (type one in). */
export function suggestTagCode(label: string): string {
  return slugify(label).slice(0, 40).replace(/-+$/g, '');
}

function nameProblem(value: string, what: string, max = 80): string | null {
  const v = value.trim();
  if (v === '') return `The ${what} is required.`;
  if (v.length > max) return `The ${what} is too long (${max} characters at most).`;
  return null;
}

export function validateLanguage(i: { code: string; name: string; native_name: string }): string | null {
  if (!/^[a-z]{2,3}$/.test(normalizeLanguageCode(i.code))) return 'A language code is 2 or 3 letters, for example ta, ml or hin.';
  return nameProblem(i.name, 'name') ?? (i.native_name.trim().length > 80 ? 'The name in its own script is too long (80 characters at most).' : null);
}

export function validateRegion(i: { code: string; name: string }): string | null {
  if (!/^[A-Z]{2}(-[A-Z0-9]{1,3})?$/.test(normalizeRegionCode(i.code))) return 'A region code is a country such as IN, or a state such as IN-TN (country, a hyphen, then 1 to 3 letters or digits).';
  return nameProblem(i.name, 'name');
}

export function validateTag(i: { code: string; label: string }, single: string): string | null {
  const code = i.code.trim();
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(code) || code.length > 40) return `A ${single} code uses lowercase letters, numbers and single hyphens, for example sunday-service.`;
  return nameProblem(i.label, 'label');
}

/** A sentence for a failed save or delete. For a delete that is refused because the value is in use, the database's own message says what still uses it. */
export function explainReferenceError(error: AdminError, action: 'save' | 'delete'): string {
  if (error.code === '23505') return 'That code is already in the list.';
  if (error.code === '23503' && action === 'delete' && error.message) return `${error.message}.`;
  if (error.code === '23514' && error.message) return `${error.message}.`;
  return explainAdminError(error);
}
