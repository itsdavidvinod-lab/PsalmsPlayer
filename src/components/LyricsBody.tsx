import type { Line } from '@/lib/chordpro';

/** Lyrics as lines, with or without chords above them. Shared by the song page and Stage mode. */
export default function LyricsBody({ lines, chordsOn, sizeRem, className = 'lyrics' }: { lines: Line[]; chordsOn: boolean; sizeRem: number; className?: string }) {
  return (
    <div className={className} style={{ '--lyric-size': `${sizeRem}rem` } as React.CSSProperties}>
      {lines.map((line, i) => {
        if (line.type === 'blank') return <div key={i} className="lyric-gap" />;
        if (line.type === 'section') return <div key={i} className="lyric-section">{line.label}</div>;
        if (!chordsOn) {
          return <p key={i} className="lyric-line">{line.segments.map((s) => s.text).join('') || ' '}</p>;
        }
        return (
          <p key={i} className="lyric-line">
            {line.segments.map((s, j) => (
              <span key={j} className="seg">
                <span className="seg-chord">{s.chord ?? ' '}</span>
                <span className="seg-text">{s.text || ' '}</span>
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}
