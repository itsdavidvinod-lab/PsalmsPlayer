'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { AdminRequest } from '@/lib/admin-types';
import { explainAdminError } from '@/lib/admin-text';
import { REQUEST_CHANNELS, REQUEST_KINDS, REQUEST_STATUSES, isoToPaidOn, paidOnToIso, paiseToInput, rupeesToPaise, validateRequest, type RequestChannel, type RequestKind, type RequestStatus } from '@/lib/ledger';
import { createClient } from '@/lib/supabase/client';

type Status = { ok: boolean; text: string } | null;

/** One request in the ledger. Money is typed in rupees and stored in paise. Only admins can read or write any of it. */
export default function RequestForm({ request }: { request: AdminRequest | null }) {
  const router = useRouter();
  const [kind, setKind] = useState<RequestKind>(request?.kind ?? 'promotion');
  const [channel, setChannel] = useState<RequestChannel>(request?.channel ?? 'whatsapp');
  const [contact, setContact] = useState(request?.contact ?? '');
  const [verified, setVerified] = useState(request?.contact_verified ?? false);
  const [status, setStatusValue] = useState<RequestStatus>(request?.status ?? 'in_discussion');
  const [amount, setAmount] = useState(paiseToInput(request?.amount_paise));
  const [paidOn, setPaidOn] = useState(isoToPaidOn(request?.paid_at));
  const [refund, setRefund] = useState(paiseToInput(request?.refund_paise));
  const [refundReason, setRefundReason] = useState(request?.refund_reason ?? '');
  const [notes, setNotes] = useState(request?.notes ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<Status>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    const problem = validateRequest({ kind, channel, contact, status, amount, refund, refund_reason: refundReason, paid_on: paidOn });
    if (problem) return setMsg({ ok: false, text: problem });
    const amountPaise = rupeesToPaise(amount);
    const refundPaise = rupeesToPaise(refund);
    if (!amountPaise.ok || !refundPaise.ok) return setMsg({ ok: false, text: 'An amount is not a valid number of rupees.' });
    const row = {
      kind,
      channel,
      contact: contact.trim(),
      contact_verified: verified,
      status,
      amount_paise: amountPaise.value,
      paid_at: paidOnToIso(paidOn),
      refund_paise: refundPaise.value,
      refund_reason: refundReason.trim() || null,
      notes: notes.trim() || null,
    };
    setBusy(true);
    const supabase = createClient();
    if (!request) {
      const { data, error } = await supabase.from('requests').insert(row).select('id').single();
      setBusy(false);
      if (error || !data) return setMsg({ ok: false, text: explainAdminError(error ?? {}) });
      router.push(`/admin/requests/${data.id}`);
      router.refresh();
      return;
    }
    const { error } = await supabase.from('requests').update(row).eq('id', request.id);
    setBusy(false);
    if (error) return setMsg({ ok: false, text: explainAdminError(error) });
    const ends = status === 'refunded' || status === 'cancelled';
    setMsg({ ok: true, text: ends ? 'Saved. Any live poster of this request has been switched off.' : 'Saved.' });
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="card">
      <div className="field">
        <label htmlFor="req-kind">What it is for</label>
        <select id="req-kind" className="input" value={kind} onChange={(e) => setKind(e.target.value as RequestKind)}>
          {REQUEST_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="req-channel">Where it came from</label>
        <select id="req-channel" className="input" value={channel} onChange={(e) => setChannel(e.target.value as RequestChannel)}>
          {REQUEST_CHANNELS.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
        </select>
      </div>
      <div className="field">
        <label htmlFor="req-contact">Contact</label>
        <input id="req-contact" className="input" maxLength={200} value={contact} onChange={(e) => setContact(e.target.value)} placeholder={channel === 'email' ? 'band@example.org' : '+919876543210'} />
      </div>
      <label className="check" style={{ marginBottom: 14 }}>
        <input id="req-verified" type="checkbox" checked={verified} onChange={(e) => setVerified(e.target.checked)} />
        <span>Contact verified</span>
      </label>
      <p className="small muted" style={{ marginTop: -8 }}>Tick only after the requester has replied from this number or address. A poster cannot go live without it.</p>

      <div className="field">
        <label htmlFor="req-status">Status</label>
        <select id="req-status" className="input" value={status} onChange={(e) => setStatusValue(e.target.value as RequestStatus)}>
          {REQUEST_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <span className="small muted">Refunded or Cancelled switches off every poster of this request at once.</span>
      </div>
      <div className="field">
        <label htmlFor="req-amount">Amount agreed (₹)</label>
        <input id="req-amount" className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="1500" />
        <span className="small muted">Only admins see amounts. Leave empty until it is agreed; a poster needs it recorded (0 for a free one).</span>
      </div>
      <div className="field">
        <label htmlFor="req-paid-on">Paid on</label>
        <input id="req-paid-on" className="input" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="req-refund">Refunded (₹)</label>
        <input id="req-refund" className="input" inputMode="decimal" value={refund} onChange={(e) => setRefund(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="req-refund-reason">Refund reason</label>
        <input id="req-refund-reason" className="input" maxLength={500} value={refundReason} onChange={(e) => setRefundReason(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="req-notes">Notes</label>
        <textarea id="req-notes" className="input" rows={3} maxLength={2000} value={notes} onChange={(e) => setNotes(e.target.value)} />
        <span className="small muted">Private. Never shown to users.</span>
      </div>
      <button type="submit" className="btn btn-primary" disabled={busy}>{request ? 'Save request' : 'Create request'}</button>
      {msg ? <p className={msg.ok ? 'ok' : 'error'} role={msg.ok ? 'status' : 'alert'} style={{ marginTop: 12 }}>{msg.text}</p> : null}
    </form>
  );
}
