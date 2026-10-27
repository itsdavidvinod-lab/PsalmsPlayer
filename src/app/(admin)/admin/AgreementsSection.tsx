'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AdminAgreement } from '@/lib/admin-types';
import { AGREEMENT_STATUSES, ENFORCED_RIGHTS, RECORDED_RIGHTS, agreementPhase, agreementSummary, parseTerritories, phaseLabel, stampsFor, validateAgreement, type AgreementStatus, type RightKey } from '@/lib/agreement-form';
import { explainAdminError } from '@/lib/admin-text';
import { createClient } from '@/lib/supabase/client';

type Status = { ok: boolean; text: string } | null;

function AgreementForm({ artistId, adminId, agreement }: { artistId: string; adminId: string; agreement: AdminAgreement | null }) {
  const router = useRouter();
  const idp = `agr-${agreement?.id ?? 'new'}`;
  const [status, setStatus] = useState<AgreementStatus>(agreement?.status ?? 'sent');
  const [starts, setStarts] = useState(agreement?.starts_on ?? '');
  const [expires, setExpires] = useState(agreement?.expires_on ?? '');
  const [ref, setRef] = useState(agreement?.document_ref ?? '');
  const [email, setEmail] = useState(agreement?.revocation_email ?? '');
  const [territories, setTerritories] = useState((agreement?.territories ?? []).join(', '));
  const [rights, setRights] = useState<Record<RightKey, boolean>>({
    allow_lyrics: agreement?.allow_lyrics ?? false,
    allow_chords: agreement?.allow_chords ?? false,
    allow_translations: agreement?.allow_translations ?? false,
    allow_video_embed: agreement?.allow_video_embed ?? false,
    allow_audio_hosting: agreement?.allow_audio_hosting ?? false,
    allow_photo_bio: agreement?.allow_photo_bio ?? false,
  });
  const [busy, setBusy] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [msg, setMsg] = useState<Status>(null);

  const revoking = status === 'revoked' && agreement?.status !== 'revoked';

  async function persist(confirmed: boolean) {
    setMsg(null);
    const problem = validateAgreement({ status, starts_on: starts, expires_on: expires, document_ref: ref, revocation_email: email, territories });
    if (problem) return setMsg({ ok: false, text: problem });
    const parsed = parseTerritories(territories);
    if (!parsed.ok) return setMsg({ ok: false, text: parsed.reason });
    // Revoking takes the artist's songs off the site at once, so it asks for a second click.
    if (revoking && !confirmed) return setConfirmRevoke(true);

    const stamps = stampsFor(agreement, status, adminId, new Date().toISOString());
    const row = {
      status,
      starts_on: starts || null,
      expires_on: expires || null,
      document_ref: ref.trim() || null,
      revocation_email: email.trim() || null,
      territories: parsed.value,
      ...rights,
      ...stamps,
    };
    setBusy(true);
    const supabase = createClient();
    const { error } = agreement
      ? await supabase.from('agreements').update(row).eq('id', agreement.id)
      : await supabase.from('agreements').insert({ ...row, artist_id: artistId });
    setBusy(false);
    setConfirmRevoke(false);
    if (error) return setMsg({ ok: false, text: explainAdminError(error) });
    if (!agreement) {
      setStatus('sent');
      setStarts('');
      setExpires('');
      setRef('');
      setEmail('');
      setTerritories('');
      setRights({ allow_lyrics: false, allow_chords: false, allow_translations: false, allow_video_embed: false, allow_audio_hosting: false, allow_photo_bio: false });
    }
    setMsg({ ok: true, text: agreement ? 'Saved.' : 'Agreement added.' });
    router.refresh();
  }

  return (
    <form onSubmit={(e) => { e.preventDefault(); void persist(false); }} className="adm-form" style={{ marginTop: 12 }}>
      <div className="field">
        <label htmlFor={`${idp}-status`}>Status</label>
        <select id={`${idp}-status`} className="input" value={status} onChange={(e) => { setStatus(e.target.value as AgreementStatus); setConfirmRevoke(false); }}>
          {AGREEMENT_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <span className="small muted">Only Verified counts. Verifying records you and the time.</span>
      </div>
      <div className="field">
        <label htmlFor={`${idp}-ref`}>Document reference</label>
        <input id={`${idp}-ref`} className="input" maxLength={300} value={ref} onChange={(e) => setRef(e.target.value)} />
        <span className="small muted">The message or file name of the signed agreement in the official mailbox. Required to verify.</span>
      </div>
      <div className="field">
        <label htmlFor={`${idp}-starts`}>Starts on</label>
        <input id={`${idp}-starts`} className="input" type="date" value={starts} onChange={(e) => setStarts(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${idp}-expires`}>Ends on</label>
        <input id={`${idp}-expires`} className="input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
        <span className="small muted">Valid through the end of this day, India time.</span>
      </div>

      <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
        <legend>Rights the artist granted</legend>
        {ENFORCED_RIGHTS.map((r) => (
          <div key={r.key} style={{ marginBottom: 6 }}>
            <label className="check">
              <input type="checkbox" id={`${idp}-${r.key}`} checked={rights[r.key]} onChange={(e) => setRights({ ...rights, [r.key]: e.target.checked })} />
              <span>{r.label}</span>
            </label>
            <div className="small muted" style={{ marginLeft: 28 }}>{r.effect}</div>
          </div>
        ))}
      </fieldset>
      <fieldset className="field" style={{ border: 0, padding: 0, margin: '0 0 14px' }}>
        <legend>Kept on record only (the site does not act on these yet)</legend>
        {RECORDED_RIGHTS.map((r) => (
          <label key={r.key} className="check">
            <input type="checkbox" id={`${idp}-${r.key}`} checked={rights[r.key]} onChange={(e) => setRights({ ...rights, [r.key]: e.target.checked })} />
            <span>{r.label}</span>
          </label>
        ))}
        <div className="field" style={{ marginTop: 8 }}>
          <label htmlFor={`${idp}-territories`}>Territories</label>
          <input id={`${idp}-territories`} className="input" value={territories} onChange={(e) => setTerritories(e.target.value)} placeholder="IN, LK" />
          <span className="small muted">Country codes, separated by commas. The site does not limit by country yet.</span>
        </div>
      </fieldset>

      <div className="field">
        <label htmlFor={`${idp}-email`}>Withdrawal email</label>
        <input id={`${idp}-email`} className="input" inputMode="email" maxLength={200} value={email} onChange={(e) => setEmail(e.target.value)} />
        <span className="small muted">Where the artist writes to take this back.</span>
      </div>

      {confirmRevoke ? (
        <p>
          Revoke this agreement? The artist’s songs stop showing for everyone at once.{' '}
          <button type="button" className="btn" disabled={busy} onClick={() => void persist(true)}>Yes, revoke</button>{' '}
          <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => setConfirmRevoke(false)}>Cancel</button>
        </p>
      ) : (
        <button type="submit" className="btn" disabled={busy}>{agreement ? 'Save agreement' : 'Add agreement'}</button>
      )}
      {msg ? <p className={msg.ok ? 'ok' : 'error'} role={msg.ok ? 'status' : 'alert'} style={{ marginTop: 12 }}>{msg.text}</p> : null}
    </form>
  );
}

/** Everything about an artist's agreements. They are never deleted: a record of what was agreed stays, and revoking ends it. */
export default function AgreementsSection({ artistId, adminId, agreements, today }: { artistId: string; adminId: string; agreements: AdminAgreement[]; today: string }) {
  return (
    <div>
      {agreements.length === 0 ? <p className="muted small">No agreements yet. Songs of this artist stay hidden until one is verified.</p> : null}
      <div className="grid-list">
        {agreements.map((a) => {
          const phase = agreementPhase(a, today);
          return (
            <details key={a.id} className="card">
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                {agreementSummary(a, today)}{' '}
                <span className={phase === 'in_force' ? 'pill' : 'pill pill-quiet'}>{phaseLabel(phase)}</span>
              </summary>
              <AgreementForm artistId={artistId} adminId={adminId} agreement={a} />
            </details>
          );
        })}
      </div>
      <details className="card" style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Add an agreement</summary>
        <AgreementForm artistId={artistId} adminId={adminId} agreement={null} />
      </details>
      <p className="small muted" style={{ marginTop: 8 }}>Agreements are never deleted. To end one, set it to Revoked. Every change is recorded with who made it.</p>
    </div>
  );
}
