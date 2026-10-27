'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AdminCredit, ConsentStatus, CreditRole } from '@/lib/admin-types';
import { CONSENT_STATUSES, CREDIT_ROLES, explainAdminError } from '@/lib/admin-text';
import { createClient } from '@/lib/supabase/client';

type Status = { ok: boolean; text: string } | null;

function CreditForm({ songId, credit }: { songId: string; credit: AdminCredit | null }) {
  const router = useRouter();
  const idp = `credit-${credit?.id ?? 'new'}`;
  const [person, setPerson] = useState(credit?.person_name ?? '');
  const [role, setRole] = useState<CreditRole>(credit?.role ?? 'writer');
  const [contact, setContact] = useState(credit?.contact ?? '');
  const [consent, setConsent] = useState<ConsentStatus>(credit?.consent_status ?? 'pending');
  const [ref, setRef] = useState(credit?.consent_ref ?? '');
  const [expires, setExpires] = useState(credit?.consent_expires_on ?? '');
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [status, setStatus] = useState<Status>(null);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus(null);
    if (person.trim() === '') return setStatus({ ok: false, text: 'The person’s name is required.' });
    const row = {
      person_name: person.trim(),
      role,
      contact: contact.trim() || null,
      consent_status: consent,
      consent_ref: ref.trim() || null,
      consent_expires_on: expires || null,
    };
    setBusy(true);
    const supabase = createClient();
    const { error } = credit
      ? await supabase.from('song_credits').update(row).eq('id', credit.id)
      : await supabase.from('song_credits').insert({ ...row, song_id: songId });
    setBusy(false);
    if (error) return setStatus({ ok: false, text: explainAdminError(error) });
    if (!credit) {
      setPerson('');
      setContact('');
      setConsent('pending');
      setRef('');
      setExpires('');
      setRole('writer');
    }
    setStatus({ ok: true, text: credit ? 'Saved.' : 'Credit added.' });
    router.refresh();
  }

  async function remove() {
    if (!credit) return;
    setBusy(true);
    const { error } = await createClient().from('song_credits').delete().eq('id', credit.id);
    setBusy(false);
    setConfirmDelete(false);
    if (error) return setStatus({ ok: false, text: explainAdminError(error) });
    router.refresh();
  }

  return (
    <form onSubmit={save} className="adm-form" style={{ marginTop: 12 }}>
      <div className="field">
        <label htmlFor={`${idp}-person`}>Person</label>
        <input id={`${idp}-person`} className="input" required maxLength={120} value={person} onChange={(e) => setPerson(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${idp}-role`}>Role</label>
        <select id={`${idp}-role`} className="input" value={role} onChange={(e) => setRole(e.target.value as CreditRole)}>
          {CREDIT_ROLES.map((r) => (
            <option key={r.value} value={r.value}>{r.label}</option>
          ))}
        </select>
        <span className="small muted">A song needs at least one writer. Every writer and owner must give consent before the song can go live.</span>
      </div>
      <div className="field">
        <label htmlFor={`${idp}-contact`}>Contact (admin only)</label>
        <input id={`${idp}-contact`} className="input" maxLength={200} value={contact} onChange={(e) => setContact(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${idp}-consent`}>Consent</label>
        <select id={`${idp}-consent`} className="input" value={consent} onChange={(e) => setConsent(e.target.value as ConsentStatus)}>
          {CONSENT_STATUSES.map((c) => (
            <option key={c.value} value={c.value}>{c.label}</option>
          ))}
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${idp}-ref`}>Where the consent is recorded</label>
        <input id={`${idp}-ref`} className="input" maxLength={200} value={ref} onChange={(e) => setRef(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor={`${idp}-expires`}>Consent valid through (optional)</label>
        <input id={`${idp}-expires`} className="input" type="date" value={expires} onChange={(e) => setExpires(e.target.value)} />
      </div>
      {status ? <p className={status.ok ? 'ok' : 'error'} role={status.ok ? 'status' : 'alert'}>{status.text}</p> : null}
      <div className="toolbar" style={{ margin: 0 }}>
        <button type="submit" className="btn btn-primary" disabled={busy}>{credit ? 'Save credit' : 'Add credit'}</button>
        {credit && !confirmDelete ? (
          <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(true)}>Remove</button>
        ) : null}
        {credit && confirmDelete ? (
          <>
            <span>Remove this credit for good?</span>
            <button type="button" className="btn" disabled={busy} onClick={() => void remove()}>Yes, remove</button>
            <button type="button" className="btn btn-ghost" onClick={() => setConfirmDelete(false)}>Keep it</button>
          </>
        ) : null}
      </div>
    </form>
  );
}

/** Writers, owners, performers and translators of the song, and whether each has consented. */
export default function CreditsSection({ songId, credits }: { songId: string; credits: AdminCredit[] }) {
  return (
    <div>
      {credits.length === 0 ? <p className="muted small">No credits yet. A song without a writer can never go live.</p> : null}
      <div className="grid-list">
        {credits.map((c) => (
          <details key={c.id} className="card">
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
              {c.person_name}{' '}
              <span className="pill pill-quiet">{CREDIT_ROLES.find((r) => r.value === c.role)?.label ?? c.role}</span>{' '}
              <span className={c.consent_status === 'granted' ? 'pill' : 'pill pill-gold'}>
                {CONSENT_STATUSES.find((s) => s.value === c.consent_status)?.label ?? c.consent_status}
              </span>
            </summary>
            <CreditForm songId={songId} credit={c} />
          </details>
        ))}
      </div>
      <details className="card" style={{ marginTop: 8 }}>
        <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Add a credit</summary>
        <CreditForm songId={songId} credit={null} />
      </details>
    </div>
  );
}
