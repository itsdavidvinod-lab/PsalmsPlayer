import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import type { AdminRequest } from '@/lib/admin-types';
import { REQUEST_KINDS, REQUEST_STATUSES, paiseToRupees, requestStatusLabel } from '@/lib/ledger';
import PageHead from '../PageHead';
import TableFilter from '../TableFilter';

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
      <PageHead
        title="Requests"
        sub="Who asked for what, what was agreed and whether it was paid. Only admins can see this page or any amount on it."
        actions={<Link href="/admin/requests/new" className="btn btn-primary">New request</Link>}
      />
      {error ? <p className="error adm-banner" role="alert">The list could not be loaded. Please refresh in a moment.</p> : null}
      {requests.length === 0 && !error ? (
        <div className="card empty">
          <p>No requests yet.</p>
          <Link href="/admin/requests/new" className="btn btn-primary">Add the first request</Link>
        </div>
      ) : (
        <TableFilter
          idPrefix="request"
          searchLabel="Search requests"
          searchPlaceholder="Search by contact"
          noun="requests"
          total={requests.length}
          selects={[
            {
              id: 'request-show',
              label: 'Show',
              attr: 'status',
              options: [{ value: 'all', label: 'All requests' }, ...REQUEST_STATUSES.map((s) => ({ value: s.value, label: s.label }))],
            },
          ]}
        >
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">Contact</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Channel</th>
                  <th scope="col">Amount</th>
                  <th scope="col">Contact check</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const kind = REQUEST_KINDS.find((k) => k.value === r.kind)?.label.split(' (')[0] ?? r.kind;
                  const channel = r.channel === 'email' ? 'Email' : 'WhatsApp';
                  return (
                    <tr key={r.id} data-search={`${r.contact} ${kind} ${channel}`.toLowerCase()} data-status={r.status}>
                      <td>
                        <Link href={`/admin/requests/${r.id}`} className="adm-name">
                          <span className="adm-name-text">
                            <span className="adm-name-title">{r.contact}</span>
                          </span>
                        </Link>
                      </td>
                      <td>{kind}</td>
                      <td>{channel}</td>
                      <td>{paiseToRupees(r.amount_paise)}</td>
                      <td><span className={r.contact_verified ? 'pill' : 'pill pill-quiet'}>{r.contact_verified ? 'Verified' : 'Not verified'}</span></td>
                      <td><span className="pill pill-gold">{requestStatusLabel(r.status)}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </TableFilter>
      )}
    </div>
  );
}
