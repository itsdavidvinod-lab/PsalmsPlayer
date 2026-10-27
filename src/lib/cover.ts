// Placeholder pictures. A song, artist, list or person without a picture gets a coloured square with an initial.
// The colour comes from the name, so the same name always gets the same colour on every screen.

/** The six colour pairs of the design (the genre tiles use the same ones). */
export const COVER_PALETTE: ReadonlyArray<readonly [string, string]> = [
  ['#2d3a8c', '#4c5fd0'],
  ['#8c5a2d', '#b0702e'],
  ['#7a2f4f', '#a8456f'],
  ['#6b3fa0', '#8a57c9'],
  ['#1f6f5c', '#2a8570'],
  ['#a04a2b', '#c4682f'],
];

/** 32-bit FNV-1a. Small, fast, and the same everywhere. */
function hash(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function coverColors(name: string): readonly [string, string] {
  return COVER_PALETTE[hash(name.trim().toLowerCase()) % COVER_PALETTE.length];
}

/** The CSS background for a placeholder: a soft highlight over a diagonal gradient. */
export function coverBackground(name: string): string {
  const [a, b] = coverColors(name);
  return `radial-gradient(circle at 30% 25%, rgba(255,255,255,0.25), transparent 55%), linear-gradient(135deg, ${a}, ${b})`;
}

/** The first letter of a name, in capitals, or "?" when there is none. Works for any script. */
export function initialOf(name: string | null | undefined): string {
  const first = Array.from((name ?? '').trim())[0];
  return first ? first.toLocaleUpperCase() : '?';
}
