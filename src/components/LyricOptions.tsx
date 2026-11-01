'use client';

import type { LyricsVersion } from '@/lib/types';

const VERSION_LABEL: Record<LyricsVersion['version'], string> = {
  original: 'Original',
  romanized: 'Romanized',
  meaning: 'Meaning',
};

export type LyricOptionsProps = {
  versions: LyricsVersion['version'][];
  versionIdx: number;
  onVersion: (index: number) => void;
  chordsAvailable: boolean;
  showChords: boolean;
  onShowChords: (show: boolean) => void;
  semitones: number;
  keyLabel: string | null;
  onSemitones: (value: number) => void;
  sizePercent: number;
  onSmaller: () => void;
  onLarger: () => void;
};

/** The reading options, shown at the top of a song's ⋮ menu: which version of the words, how big, and (only when the
 *  song has chords) show or hide them and move the key. */
export default function LyricOptions(o: LyricOptionsProps) {
  return (
    <div className="opt-list">
      {o.versions.length > 1 ? (
        <div className="opt-row">
          <span className="opt-label">Lyrics</span>
          <div className="opt-chips" role="group" aria-label="Lyrics version">
            {o.versions.map((v, i) => (
              <button key={v} type="button" className="chip" aria-pressed={i === o.versionIdx} onClick={() => o.onVersion(i)}>
                {VERSION_LABEL[v]}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="opt-row">
        <span className="opt-label">Text size</span>
        <div className="stepper" role="group" aria-label="Text size">
          <button type="button" onClick={o.onSmaller} aria-label="Smaller text">A−</button>
          <span>{o.sizePercent}%</span>
          <button type="button" onClick={o.onLarger} aria-label="Larger text">A+</button>
        </div>
      </div>

      {o.chordsAvailable ? (
        <>
          <div className="opt-row">
            <span className="opt-label">Chords</span>
            <button type="button" className="chip" aria-pressed={o.showChords} onClick={() => o.onShowChords(!o.showChords)}>
              {o.showChords ? 'Hide chords' : 'Show chords'}
            </button>
          </div>
          <div className="opt-row">
            <span className="opt-label">Key</span>
            <div className="opt-chips">
              <div className="stepper" role="group" aria-label="Transpose">
                <button type="button" onClick={() => o.onSemitones(Math.max(-6, o.semitones - 1))} aria-label="Down one semitone">−</button>
                <span>{o.keyLabel ? `Key ${o.keyLabel}` : o.semitones === 0 ? 'Original' : `${o.semitones > 0 ? '+' : ''}${o.semitones}`}</span>
                <button type="button" onClick={() => o.onSemitones(Math.min(6, o.semitones + 1))} aria-label="Up one semitone">+</button>
              </div>
              {o.semitones !== 0 ? (
                <button type="button" className="chip" onClick={() => o.onSemitones(0)}>Reset</button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
