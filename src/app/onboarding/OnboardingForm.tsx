'use client';

import { useState } from 'react';
import { onboardingChoice } from '@/lib/onboarding';
import { createClient } from '@/lib/supabase/client';
import type { Language, Region } from '@/lib/types';

type Props = { userId: string; next: string; languages: Language[]; regions: Region[]; languageCodes: string[]; regionCode: string | null };

/** Languages (as many as you like) and one region. Continue saves them; Skip saves nothing. Either way this step is not shown again. */
export default function OnboardingForm({ userId, next, languages, regions, languageCodes, regionCode }: Props) {
  const [selected, setSelected] = useState<string[]>(languageCodes);
  const [region, setRegion] = useState(regionCode ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function toggle(code: string) {
    setSelected((cur) => (cur.includes(code) ? cur.filter((c) => c !== code) : [...cur, code]));
  }

  async function finish(skipped: boolean) {
    setBusy(true);
    setError(null);
    const { error: err } = await createClient()
      .from('profiles')
      .update(onboardingChoice(selected, region, new Date().toISOString(), skipped))
      .eq('id', userId);
    if (err) {
      setBusy(false);
      setError('Could not save. Please try again, or skip for now.');
      return;
    }
    // A full load, so the signed-in screens start fresh with the choices in place.
    window.location.assign(next);
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void finish(false); }} className="card section">
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

      {error ? <p className="error" role="alert">{error}</p> : null}
      <button type="submit" className="btn btn-primary btn-block" disabled={busy || (selected.length === 0 && region === '')}>
        {busy ? 'Saving…' : 'Continue'}
      </button>
      <button type="button" className="btn btn-ghost btn-block" style={{ marginTop: 8 }} disabled={busy} onClick={() => void finish(true)}>
        Skip for now
      </button>
    </form>
  );
}
