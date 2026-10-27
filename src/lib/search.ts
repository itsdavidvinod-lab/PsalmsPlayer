// What the Search page asks for: some text and up to four filters, all carried in the address so a result can be shared,
// reloaded and reached with Back.

export const FILTER_KINDS = ['language', 'genre', 'occasion', 'mood'] as const;
export type FilterKind = (typeof FILTER_KINDS)[number];

export type SearchState = { q: string } & Partial<Record<FilterKind, string>>;

/** Keeps the search text to plain characters so it can only widen or narrow the match, never change the query.
 *  Letters, digits and the marks that belong to letters (vowel signs and the like in Tamil, Kannada, Hindi and so on) stay. */
export function cleanQuery(q: string | undefined | null): string {
  return (q ?? '').replace(/[^\p{L}\p{M}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

type RawParams = Record<string, string | string[] | undefined>;

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** Reads the address. A filter value that is not in the list of known values (a typo, an old link, something hostile) is dropped. */
export function parseSearch(raw: RawParams, known: Record<FilterKind, readonly string[]>): SearchState {
  const state: SearchState = { q: cleanQuery(first(raw.q)) };
  for (const kind of FILTER_KINDS) {
    const value = first(raw[kind]);
    if (value && known[kind].includes(value)) state[kind] = value;
  }
  return state;
}

/** True when there is text or a filter, so results are shown instead of the browsing screen. */
export function hasSearch(state: SearchState): boolean {
  return state.q !== '' || FILTER_KINDS.some((k) => Boolean(state[k]));
}

/** The address for a state: `/search` alone when nothing is asked for. */
export function searchHref(state: Partial<SearchState>): string {
  const params = new URLSearchParams();
  if (state.q) params.set('q', state.q);
  for (const kind of FILTER_KINDS) {
    const value = state[kind];
    if (value) params.set(kind, value);
  }
  const text = params.toString();
  return text ? `/search?${text}` : '/search';
}
