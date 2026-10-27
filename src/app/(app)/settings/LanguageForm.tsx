'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Language, Region } from '@/lib/types';

type Props = { userId: string; languageCodes: string[]; regionCode: string | null; languages: Language[]; regions: Region[] };

/** Languages and region: they decide which posters and songs Home shows first. */
export default function LanguageForm({ userId, languageCodes, regionCode, languages, regions }: Props) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(languageCodes);
  const [region, setRegion] = useState(regionCode ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function toggle(code: string) {
    setSelected((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const { error } = await createClient()
      .from('profiles')
      .update({ language_codes: selected, region_code: region || null })
      .eq('id', userId);
    setBusy(false);
    if (error) {
      setMsg({ ok: false, text: 'Could not save. Please try again.' });
    } else {
      setMsg({ ok: true, text: 'Saved.' });
      router.refresh();
    }
  }

  return (
    <form onSubmit={onSubmit} className="card section">
      <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
        <legend>Languages</legend>
        <div className="checks">
          {languages.map((l) => (
            <label key={l.code} className="check">
              <input type="checkbox" checked={selected.includes(l.code)} onChange={() => toggle(l.code)} />
              <span>{l.native_name && l.native_name !== l.name ? `${l.name} · ${l.native_name}` : l.name}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor="region">Region</label>
        <select id="region" className="input" value={region} onChange={(e) => setRegion(e.target.value)}>
          <option value="">Not set</option>
          {regions.map((r) => (
            <option key={r.code} value={r.code}>{r.name}</option>
          ))}
        </select>
      </div>

      {msg ? <p className={msg.ok ? 'ok' : 'error'} role="status">{msg.text}</p> : null}
      <button type="submit" className="btn btn-primary" disabled={busy}>Save</button>
    </form>
  );
}
