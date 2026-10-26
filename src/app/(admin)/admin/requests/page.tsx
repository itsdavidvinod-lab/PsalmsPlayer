import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import type { AdminRequest } from '@/lib/admin-types';
import { REQUEST_KINDS, paiseToRupees, requestStatusLabel } from '@/lib/ledger';

export const metadata: Metadata = { title: 'Requests · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminRequests() {
  const { supabase } = await requireAdmin('/admin/requests');
  const { data, error } = await supabase
    .from('requests')
    .select('id, kind, channel, contact, contact_verified, status, amount_paise, paid_at, refund_paise, refund_reason, notes, created_at')
    .order('created_at', { ascending: false });
  if (error) console.error('admin requests: load failed', error);
  const requests = (data ?? []) as AdminRequest[];

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: 'space-between', marginTop: 20 }}>
        <h1 style={{ fontSize: '1.6rem' }}>Requests</h1>
        <Link href="/admin/requests/new" className="btn btn-primary">New request</Link>
      </div>
      <p className="small muted">Who asked for what, what was agreed and whether it was paid. Only admins can see this page or any amount on it.</p>
      {error ? <p className="error" role="alert">The list could not be loaded. Please refresh in a moment.</p> : null}
      {requests.length === 0 && !error ? (
        <div className="card empty">
          <p>No requests yet.</p>
          <Link href="/admin/requests/new" className="btn btn-primary">Add the first request</Link>
        </div>
      ) : (
        <div className="grid-list">
          {requests.map((r) => (
            <Link key={r.id} href={`/admin/requests/${r.id}`} className="row-link">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="song-title">{r.contact}</div>
                <div className="small muted">
                  {REQUEST_KINDS.find((k) => k.value === r.kind)?.label.split(' (')[0]} · {r.channel === 'email' ? 'Email' : 'WhatsApp'} · {paiseToRupees(r.amount_paise)}
                </div>
              </div>
              <div className="pills" style={{ marginTop: 0 }}>
                <span className={r.contact_verified ? 'pill' : 'pill pill-quiet'}>{r.contact_verified ? 'Verified' : 'Not verified'}</span>
                <span className="pill pill-gold">{requestStatusLabel(r.status)}</span>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
