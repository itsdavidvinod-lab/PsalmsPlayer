import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import type { AdminRequest } from '@/lib/admin-types';
import { isUuid } from '@/lib/admin-text';
import { POSTER_STATUSES, posterPhase } from '@/lib/ledger';
import RequestForm from '../../RequestForm';

export const metadata: Metadata = { title: 'Request · Admin' };
export const dynamic = 'force-dynamic';

type PosterRow = { id: string; title: string; status: string; starts_at: string | null; ends_at: string | null; event_date: string | null };

export default async function AdminRequestPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireAdmin(`/admin/requests/${id}`);
  const [reqRes, postersRes] = await Promise.all([
    supabase
      .from('requests')
      .select('id, kind, channel, contact, contact_verified, status, amount_paise, paid_at, refund_paise, refund_reason, notes, created_at')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('posters').select('id, title, status, starts_at, ends_at, event_date').eq('request_id', id).order('created_at'),
  ]);
  if (!reqRes.data) notFound();
  const request = reqRes.data as AdminRequest;
  const posters = (postersRes.data ?? []) as PosterRow[];
  const now = Date.now();

  return (
    <div>
      <p className="small" style={{ margin: '16px 0 0' }}><Link href="/admin/requests" className="inline">Requests</Link></p>
      <h1 style={{ fontSize: '1.6rem', margin: '4px 0 12px' }}>{request.contact}</h1>
      {reqRes.error || postersRes.error ? <p className="error" role="alert">Some parts of this page could not be loaded. Please refresh.</p> : null}

      <RequestForm request={request} />

      <section className="section" aria-labelledby="req-posters">
        <h2 id="req-posters">Posters for this request</h2>
        <p style={{ margin: '0 0 12px' }}>
          <Link href={`/admin/posters/new?request=${request.id}`} className="btn btn-primary">Add a poster</Link>
        </p>
        {posters.length === 0 ? (
          <p className="muted small">No posters yet.</p>
        ) : (
          <div className="grid-list">
            {posters.map((p) => {
              const phase = posterPhase(p, now);
              return (
                <Link key={p.id} href={`/admin/posters/${p.id}`} className="row-link">
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="song-title">{p.title}</div>
                  </div>
                  <span className={phase === 'showing' ? 'pill' : 'pill pill-quiet'}>
                    {phase === 'showing' ? 'Showing now' : phase === 'scheduled' ? 'Scheduled' : phase === 'ended' ? 'Ended' : POSTER_STATUSES.find((s) => s.value === p.status)?.label.split(':')[0] ?? p.status}
                  </span>
                </Link>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}
