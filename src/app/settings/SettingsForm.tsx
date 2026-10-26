'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Language, Profile, Region } from '@/lib/types';

type Props = { userId: string; profile: Profile; languages: Language[]; regions: Region[] };

export default function SettingsForm({ userId, profile, languages, regions }: Props) {
  const router = useRouter();
  const [name, setName] = useState(profile.display_name ?? '');
  const [selected, setSelected] = useState<string[]>(profile.language_codes);
  const [region, setRegion] = useState(profile.region_code ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  function toggle(code: string) {
    setSelected((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    // Only these three columns can be changed by a user; the database rejects anything else (role included).
    const { error } = await createClient()
      .from('profiles')
      .update({ display_name: name.trim() || null, language_codes: selected, region_code: region || null })
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
      <div className="field">
        <label htmlFor="name">Display name</label>
        <input id="name" className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
      </div>

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
