// Spots mistakes in ChordPro text while an admin types, so a broken line is noticed before it reaches singers.
// Warnings only: nothing here blocks saving, because a real song can contain something unusual on purpose.
import { isChordName, isKnownDirective } from './chordpro.ts';

export type LyricsProblem = { line: number; message: string };

const DIRECTIVE = /^\{\s*([a-zA-Z_]+)\s*:?\s*(.*?)\s*\}$/;

export function checkChordPro(src: string): LyricsProblem[] {
  const problems: LyricsProblem[] = [];
  const lines = src.replace(/\r\n?/g, '\n').split('\n');
  let lyricLines = 0;

  lines.forEach((raw, i) => {
    const n = i + 1;
    const line = raw.trim();
    if (line === '') return;

    if (line.startsWith('{')) {
      const d = DIRECTIVE.exec(line);
      if (!d) {
        problems.push({ line: n, message: 'A directive starts with { but does not end with }.' });
      } else if (!isKnownDirective(d[1])) {
        problems.push({ line: n, message: `The directive {${d[1]}} is not supported and will be ignored.` });
      }
      return;
    }

    lyricLines += 1;
    let open = false;
    let current = '';
    for (const ch of raw) {
      if (ch === '[') {
        if (open) {
          problems.push({ line: n, message: 'A chord bracket [ is opened twice.' });
          return;
        }
        open = true;
        current = '';
      } else if (ch === ']') {
        if (!open) {
          problems.push({ line: n, message: 'A closing bracket ] has no opening [.' });
          return;
        }
        open = false;
        if (current.trim() === '') problems.push({ line: n, message: 'There is an empty chord [].' });
        else if (!isChordName(current)) problems.push({ line: n, message: `"${current.trim()}" does not look like a chord.` });
      } else if (open) {
        current += ch;
      }
    }
    if (open) problems.push({ line: n, message: 'A chord bracket [ is never closed.' });
  });

  if (lyricLines === 0) problems.push({ line: 0, message: 'There are no lyric lines yet.' });
  return problems;
}
