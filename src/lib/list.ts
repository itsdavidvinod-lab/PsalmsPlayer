// Finding, sorting and filtering inside one list (a playlist, a setlist or Liked songs). All of it happens on the phone:
// a list holds at most a few hundred songs and is already loaded.

import type { Song } from './types';

export type SortMode = 'custom' | 'title' | 'artist' | 'newest';
export const SORT_MODES: readonly SortMode[] = ['custom', 'title', 'artist', 'newest'];

/** A slot of a list. `song` is null when the song is not available right now: the slot keeps its place and shows no title. */
export type Slot = { id: string; song: Song | null };

export type ChipKind = 'language' | 'genre';
export type Chip = { key: string; kind: ChipKind; code: string; label: string };
export type ChipSelection = { language: readonly string[]; genre: readonly string[] };

export const NO_CHIPS: ChipSelection = { language: [], genre: [] };

/** True when the text is empty or appears in the title or the artist's name (upper or lower case, accents as typed). */
export function matchesFind(song: Song, text: string): boolean {
  const needle = text.trim().toLocaleLowerCase();
  if (needle === '') return true;
  return song.title.toLocaleLowerCase().includes(needle) || song.artist_name.toLocaleLowerCase().includes(needle);
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, undefined, { sensitivity: 'base' });
}

/** Sorts slots. `custom` keeps the order of the list (a copy is returned). Slots without a song go to the end. */
export function sortSlots<T extends Slot>(slots: readonly T[], mode: SortMode): T[] {
  const copy = slots.slice();
  if (mode === 'custom') return copy;
  const withSong = copy.filter((s): s is T & { song: Song } => s.song !== null);
  const gaps = copy.filter((s) => s.song === null);
  withSong.sort((a, b) => {
    if (mode === 'title') return compareText(a.song.title, b.song.title);
    if (mode === 'artist') return compareText(a.song.artist_name, b.song.artist_name) || compareText(a.song.title, b.song.title);
    const at = a.song.published_at ?? '';
    const bt = b.song.published_at ?? '';
    return at === bt ? compareText(a.song.title, b.song.title) : at < bt ? 1 : -1;
  });
  return [...withSong, ...gaps];
}

/** The filter buttons of a list: the languages and then the genres that really occur in it, most common first. */
export function listChips(songs: readonly Song[], languageName: (code: string) => string, genreLabel: (code: string) => string): Chip[] {
  const count = (values: string[]) => {
    const map = new Map<string, number>();
    for (const v of values) map.set(v, (map.get(v) ?? 0) + 1);
    return map;
  };
  const make = (kind: ChipKind, map: Map<string, number>, label: (code: string) => string): Chip[] =>
    Array.from(map.entries())
      .map(([code, n]) => ({ code, n, text: label(code) }))
      .sort((a, b) => b.n - a.n || compareText(a.text, b.text))
      .map((e) => ({ key: `${kind}:${e.code}`, kind, code: e.code, label: e.text }));
  return [
    ...make('language', count(songs.map((s) => s.language_code)), languageName),
    ...make('genre', count(songs.flatMap((s) => s.genres)), genreLabel),
  ];
}

/** Within a kind the chosen values are alternatives (Kannada or English); between kinds they all have to hold (Kannada and Worship). */
export function matchesChips(song: Song, chips: ChipSelection): boolean {
  if (chips.language.length > 0 && !chips.language.includes(song.language_code)) return false;
  if (chips.genre.length > 0 && !song.genres.some((g) => chips.genre.includes(g))) return false;
  return true;
}

export function isFiltering(find: string, chips: ChipSelection): boolean {
  return find.trim() !== '' || chips.language.length > 0 || chips.genre.length > 0;
}

/** What the list shows: the slots sorted, and (when finding or filtering) only the songs that match; a slot without a song is then left out. */
export function visibleSlots<T extends Slot>(slots: readonly T[], find: string, chips: ChipSelection, mode: SortMode): T[] {
  const sorted = sortSlots(slots, mode);
  if (!isFiltering(find, chips)) return sorted;
  return sorted.filter((s) => s.song !== null && matchesFind(s.song, find) && matchesChips(s.song, chips));
}

export function toggleChip(selection: ChipSelection, chip: Chip): ChipSelection {
  const current = selection[chip.kind];
  const next = current.includes(chip.code) ? current.filter((c) => c !== chip.code) : [...current, chip.code];
  return { ...selection, [chip.kind]: next };
}

export function songCountLabel(n: number): string {
  return `${n} ${n === 1 ? 'song' : 'songs'}`;
}
