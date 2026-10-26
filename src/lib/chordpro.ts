// ChordPro parsing and transposing. No dependencies, so it runs in the browser, on the server and in the mobile app.
//
// Lyrics are stored as ChordPro text: chords in [brackets] inside the line, e.g. "[G]Line of [C]lyrics".
// Supported directives: title, subtitle, artist, key, tempo, capo, comment, and the start_of_* / end_of_* sections.

export type Segment = { chord: string | null; text: string };

export type Line =
  | { type: 'lyrics'; segments: Segment[] }
  | { type: 'section'; label: string }
  | { type: 'blank' };

export type ParsedSong = { meta: Record<string, string>; lines: Line[] };

const SHARP_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const FLAT_NAMES = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];

const NOTE_INDEX: Record<string, number> = {
  C: 0, 'B#': 0, 'C#': 1, Db: 1, D: 2, 'D#': 3, Eb: 3, E: 4, Fb: 4, 'E#': 5, F: 5,
  'F#': 6, Gb: 6, G: 7, 'G#': 8, Ab: 8, A: 9, 'A#': 10, Bb: 10, B: 11, Cb: 11,
};

// Keys written with flats. Everything else is written with sharps.
const FLAT_KEYS = new Set([
  'F', 'Bb', 'Eb', 'Ab', 'Db', 'Gb', 'Cb',
  'Dm', 'Gm', 'Cm', 'Fm', 'Bbm', 'Ebm', 'Abm',
]);

const CHORD_RE = /^([A-G][#b]?)([^/]*)(?:\/([A-G][#b]?))?$/;

function mod12(n: number): number {
  return ((n % 12) + 12) % 12;
}

/** True when a key is conventionally written with flats (F, Bb, Dm, Gm ...). */
export function prefersFlats(key: string): boolean {
  return FLAT_KEYS.has(key.trim());
}

/** Moves one chord by `semitones`. Text that is not a chord (for example "N.C.") is returned unchanged. */
export function transposeChord(chord: string, semitones: number, preferFlat = false): string {
  const m = CHORD_RE.exec(chord.trim());
  if (!m) return chord;
  const [, root, quality, bass] = m;
  const names = preferFlat ? FLAT_NAMES : SHARP_NAMES;
  const move = (note: string): string => names[mod12(NOTE_INDEX[note] + semitones)];
  return move(root) + quality + (bass ? '/' + move(bass) : '');
}

/** Moves a key name such as "G", "Em" or "Bb". The result is spelled the way that key is normally written (F#, not Gb). */
export function transposeKey(key: string, semitones: number): string {
  const sharp = transposeChord(key, semitones, false);
  const flat = transposeChord(key, semitones, true);
  if (flat.startsWith('Gb')) return sharp;
  return prefersFlats(flat) ? flat : sharp;
}

/** How many semitones up (0..11) takes `from` to `to`. Both are key or chord names. */
export function semitonesBetween(from: string, to: string): number {
  const a = CHORD_RE.exec(from.trim());
  const b = CHORD_RE.exec(to.trim());
  if (!a || !b) return 0;
  return mod12(NOTE_INDEX[b[1]] - NOTE_INDEX[a[1]]);
}

// Stricter than CHORD_RE (which moves anything that starts like a chord): the quality may only use the usual symbols.
const STRICT_CHORD_RE = /^[A-G][#b]?(?:maj|min|dim|aug|sus|add|[mM+\-°ø()#b\d,])*(?:\/[A-G][#b]?)?$/;

/** True for text that looks like a chord (G, C#m7, Bb/D, N.C.). Used by the admin editor to warn about typos; the parser itself accepts anything in brackets. */
export function isChordName(text: string): boolean {
  const t = text.trim();
  return t === 'N.C.' || STRICT_CHORD_RE.test(t);
}

const CHORD_IN_LINE = /\[([^\]]*)\]/g;

function parseLyricsLine(raw: string): Line {
  const segments: Segment[] = [];
  let last = 0;
  let pendingChord: string | null = null;
  for (const m of raw.matchAll(CHORD_IN_LINE)) {
    const idx = m.index ?? 0;
    const text = raw.slice(last, idx);
    if (text !== '' || pendingChord !== null) segments.push({ chord: pendingChord, text });
    pendingChord = m[1].trim() === '' ? null : m[1].trim();
    last = idx + m[0].length;
  }
  const tail = raw.slice(last);
  if (tail !== '' || pendingChord !== null || segments.length === 0) segments.push({ chord: pendingChord, text: tail });
  return { type: 'lyrics', segments };
}

const DIRECTIVE = /^\{\s*([a-zA-Z_]+)\s*:?\s*(.*?)\s*\}$/;
const SECTION_STARTS: Record<string, string> = {
  start_of_chorus: 'Chorus', soc: 'Chorus',
  start_of_verse: 'Verse', sov: 'Verse',
  start_of_bridge: 'Bridge', sob: 'Bridge',
};
const SECTION_ENDS = new Set(['end_of_chorus', 'eoc', 'end_of_verse', 'eov', 'end_of_bridge', 'eob']);
const META_KEYS: Record<string, string> = {
  title: 'title', t: 'title', subtitle: 'subtitle', st: 'subtitle', artist: 'artist',
  key: 'key', tempo: 'tempo', capo: 'capo',
};

/** True for the directive names the parser understands. Others are ignored, which the admin editor warns about. */
export function isKnownDirective(name: string): boolean {
  const n = name.toLowerCase();
  return n in META_KEYS || n === 'comment' || n === 'c' || n === 'ci' || n === 'cb' || n in SECTION_STARTS || SECTION_ENDS.has(n);
}

export function parseChordPro(src: string): ParsedSong {
  const meta: Record<string, string> = {};
  const lines: Line[] = [];
  for (const rawLine of src.replace(/\r\n?/g, '\n').split('\n')) {
    const line = rawLine.replace(/\s+$/, '');
    const d = DIRECTIVE.exec(line.trim());
    if (d) {
      const name = d[1].toLowerCase();
      const arg = d[2];
      if (name in META_KEYS) meta[META_KEYS[name]] = arg;
      else if (name === 'comment' || name === 'c' || name === 'ci' || name === 'cb') lines.push({ type: 'section', label: arg });
      else if (name in SECTION_STARTS) lines.push({ type: 'section', label: arg || SECTION_STARTS[name] });
      else if (SECTION_ENDS.has(name)) { /* nothing to show */ }
      continue;
    }
    if (line.trim() === '') { lines.push({ type: 'blank' }); continue; }
    lines.push(parseLyricsLine(line));
  }
  return { meta, lines };
}

/** Transposes every chord in parsed lines. */
export function transposeLines(lines: Line[], semitones: number, preferFlat = false): Line[] {
  if (mod12(semitones) === 0) return lines;
  return lines.map((l) =>
    l.type === 'lyrics'
      ? { type: 'lyrics', segments: l.segments.map((s) => ({ chord: s.chord ? transposeChord(s.chord, semitones, preferFlat) : null, text: s.text })) }
      : l,
  );
}

/** Removes chords from raw ChordPro text and keeps the lyrics. */
export function stripChords(src: string): string {
  return src.replace(/\[[^\]]*\]/g, '');
}

/** Lyrics only, one string per line, for Stage mode and for copying. */
export function toPlainText(lines: Line[]): string {
  return lines
    .map((l) => (l.type === 'lyrics' ? l.segments.map((s) => s.text).join('') : l.type === 'section' ? `[${l.label}]` : ''))
    .join('\n');
}
