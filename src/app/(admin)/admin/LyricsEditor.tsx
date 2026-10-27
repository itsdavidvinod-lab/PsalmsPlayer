'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import LyricsBody from '@/components/LyricsBody';
import type { AdminLyrics, LyricsVersionName, Option } from '@/lib/admin-types';
import { explainAdminError } from '@/lib/admin-text';
import { parseChordPro } from '@/lib/chordpro';
import { checkChordPro } from '@/lib/lyrics-check';
import { createClient } from '@/lib/supabase/client';

type Status = { ok: boolean; text: string } | null;

const VERSIONS: { value: LyricsVersionName; label: string; help: string }[] = [
  { value: 'original', label: 'Original', help: 'The song as written. Chords go in [brackets] before the syllable they fall on.' },
  { value: 'romanized', label: 'Romanized', help: 'The same lyrics in Latin letters. Shown to users only when the agreement allows translations.' },
  { value: 'meaning', label: 'Meaning', help: 'What the song says, in another language. Shown to users only when the agreement allows translations.' },
];

const MAX_BODY = 20000;

/** Writes the three versions of a song's lyrics in ChordPro, with a live preview exactly as singers see it. */
export default function LyricsEditor({ songId, songLanguage, rows, languages }: {
  songId: string;
  songLanguage: string;
  rows: AdminLyrics[];
  languages: Option[];
}) {
  const router = useRouter();
  const [version, setVersion] = useState<LyricsVersionName>('original');
  const [bodies, setBodies] = useState<Record<LyricsVersionName, string>>({
    original: rows.find((r) => r.version === 'original')?.body ?? '',
    romanized: rows.find((r) => r.version === 'romanized')?.body ?? '',
    meaning: rows.find((r) => r.version === 'meaning')?.body ?? '',
  });
  const [langs, setLangs] = useState<Record<LyricsVersionName, string>>({
    original: rows.find((r) => r.version === 'original')?.language_code ?? songLanguage,
    romanized: rows.find((r) => r.version === 'romanized')?.language_code ?? '',
    meaning: rows.find((r) => r.version === 'meaning')?.language_code ?? '',
  });
  const [saved, setSaved] = useState<Record<LyricsVersionName, boolean>>({
    original: rows.some((r) => r.version === 'original'),
    romanized: rows.some((r) => r.version === 'romanized'),
    meaning: rows.some((r) => r.version === 'meaning'),
  });
  const [chordsOn, setChordsOn] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  const body = bodies[version];
  const lines = useMemo(() => parseChordPro(body).lines, [body]);
  const problems = useMemo(() => (body.trim() === '' ? [] : checkChordPro(body)), [body]);
  const current = VERSIONS.find((v) => v.value === version)!;

  function pick(v: LyricsVersionName) {
    setVersion(v);
    setStatus(null);
    setConfirmRemove(false);
  }

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    if (body.trim() === '') return setStatus({ ok: false, text: 'Write the lyrics first, or use Remove to delete this version.' });
    if (body.length > MAX_BODY) return setStatus({ ok: false, text: `The lyrics are too long (limit ${MAX_BODY} characters).` });
    setBusy(true);
    const { error } = await createClient()
      .from('lyrics')
      .upsert({ song_id: songId, version, language_code: langs[version] || null, body }, { onConflict: 'song_id,version' });
    setBusy(false);
    if (error) return setStatus({ ok: false, text: explainAdminError(error) });
    setSaved((s) => ({ ...s, [version]: true }));
    setStatus({ ok: true, text: `${current.label} lyrics saved.` });
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    setStatus(null);
    const { error } = await createClient().from('lyrics').delete().eq('song_id', songId).eq('version', version);
    setBusy(false);
    setConfirmRemove(false);
    if (error) return setStatus({ ok: false, text: explainAdminError(error) });
    setBodies((b) => ({ ...b, [version]: '' }));
    setSaved((s) => ({ ...s, [version]: false }));
    setStatus({ ok: true, text: `${current.label} lyrics removed.` });
    router.refresh();
  }

  return (
    <div className="card">
      <div className="tabs" role="group" aria-label="Lyrics version">
        {VERSIONS.map((v) => (
          <button key={v.value} type="button" className="tab" aria-pressed={version === v.value} onClick={() => pick(v.value)}>
            {v.label}
            {saved[v.value] ? ' ✓' : ''}
          </button>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>{current.help}</p>

      <form onSubmit={save} className="adm-form">
        <div className="field">
          <label htmlFor="lyrics-body">{`${current.label} lyrics (ChordPro)`}</label>
          <textarea
            id="lyrics-body"
            className="input"
            rows={14}
            spellCheck={false}
            style={{ fontFamily: 'ui-monospace, Menlo, Consolas, monospace', lineHeight: 1.5 }}
            value={body}
            onChange={(e) => setBodies((b) => ({ ...b, [version]: e.target.value }))}
          />
          <span className="small muted">
            Example: <code>{'{comment: Verse 1}'}</code> then <code>{'[G]Line of [C]lyrics'}</code>. Use <code>{'{start_of_chorus}'}</code> … <code>{'{end_of_chorus}'}</code> for a chorus.
          </span>
        </div>
        <div className="field">
          <label htmlFor="lyrics-language">Language of this version</label>
          <select id="lyrics-language" className="input" value={langs[version]} onChange={(e) => setLangs((l) => ({ ...l, [version]: e.target.value }))}>
            <option value="">Not set</option>
            {languages.map((l) => (
              <option key={l.value} value={l.value}>{l.label}</option>
            ))}
          </select>
        </div>

        {problems.length > 0 ? (
          <div className="notice" role="status" aria-label="Warnings">
            <strong>Check these before you save:</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: 20 }}>
              {problems.map((p, i) => (
                <li key={i}>{p.line > 0 ? `Line ${p.line}: ` : ''}{p.message}</li>
              ))}
            </ul>
          </div>
        ) : null}

        {status ? <p className={status.ok ? 'ok' : 'error'} role={status.ok ? 'status' : 'alert'} style={{ marginTop: 12 }}>{status.text}</p> : null}
        <div className="toolbar">
          <button type="submit" className="btn btn-primary" disabled={busy}>Save {current.label.toLowerCase()} lyrics</button>
          {saved[version] && !confirmRemove ? (
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmRemove(true)}>Remove this version</button>
          ) : null}
          {saved[version] && confirmRemove ? (
            <>
              <span>Remove it for good?</span>
              <button type="button" className="btn" disabled={busy} onClick={() => void remove()}>Yes, remove</button>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirmRemove(false)}>Keep it</button>
            </>
          ) : null}
        </div>
      </form>

      <h3 style={{ fontSize: '1.05rem', margin: '16px 0 8px' }}>Preview</h3>
      <label className="check" htmlFor="preview-chords" style={{ width: 'fit-content', marginBottom: 8 }}>
        <input id="preview-chords" type="checkbox" checked={chordsOn} onChange={(e) => setChordsOn(e.target.checked)} />
        <span>Show chords</span>
      </label>
      {body.trim() === '' ? (
        <p className="muted small">Nothing to preview yet.</p>
      ) : (
        <LyricsBody lines={lines} chordsOn={chordsOn} sizeRem={1.05} className="lyrics" />
      )}
      <p className="small muted" style={{ marginTop: 8 }}>
        Users see chords only when the artist&rsquo;s agreement allows chords; otherwise the chords are removed on the server before the lyrics are sent.
      </p>
    </div>
  );
}
