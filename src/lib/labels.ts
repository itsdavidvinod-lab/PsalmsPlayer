// Names for the codes stored on songs and artists: "ta" is Tamil, the genre "worship" is Worship.
// A code nobody has named yet (a new language added in the admin site, a tag removed later) shows as the code itself.

import type { Language, Tag, TagKind } from './types';

export type Labels = {
  languages: Language[];
  tags: Tag[];
  languageName: (code: string) => string;
  tagLabel: (kind: TagKind, code: string) => string;
};

export function makeLabels(languages: readonly Language[], tags: readonly Tag[]): Labels {
  const languageNames = new Map(languages.map((l) => [l.code, l.name]));
  const tagLabels = new Map(tags.map((t) => [`${t.kind}:${t.code}`, t.label]));
  return {
    languages: languages.slice(),
    tags: tags.slice(),
    languageName: (code) => languageNames.get(code) ?? code,
    tagLabel: (kind, code) => tagLabels.get(`${kind}:${code}`) ?? code,
  };
}

type Reader = { from: (table: string) => any };

/** Reads both reference lists (public to every signed-in person) in one go. A failure gives empty lists, and the codes show as they are. */
export async function loadLabels(db: Reader): Promise<Labels> {
  const [langs, tags] = await Promise.all([
    db.from('languages').select('code, name, native_name').order('name'),
    db.from('tags').select('kind, code, label').order('label'),
  ]);
  if (langs.error || tags.error) console.error('labels: load failed', langs.error ?? tags.error);
  return makeLabels((langs.data ?? []) as Language[], (tags.data ?? []) as Tag[]);
}
