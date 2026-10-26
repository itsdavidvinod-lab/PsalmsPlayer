import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import { POSTER_STATUSES, posterPhase } from '@/lib/ledger';

export const metadata: Metadata = { title: 'Posters · Admin' };
export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  title: string;
  kind: string;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  event_date: string | null;
  requests: { contact: string } | null;
};

export default async function AdminPosters() {
  const { supabase } = await requireAdmin('/admin/posters');
  const { data, error } = await supabase
    .from('posters')
    .select('id, title, kind, status, starts_at, ends_at, event_date, requests(contact)')
    .order('created_at', { ascending: false });
  if (error) console.error('admin posters: load failed', error);
  const posters = (data ?? []) as unknown as Row[];
  const now = Date.now();

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: 'space-between', marginTop: 20 }}>
        <h1 style={{ fontSize: '1.6rem' }}>Posters</h1>
        <Link href="/admin/posters/new" className="btn btn-primary">New poster</Link>
      </div>
      <p className="small muted">Posters appear on Home only while they are Approved and inside their dates. Users never see the dates or any amount.</p>
      {error ? <p className="error" role="alert">The list could not be loaded. Please refresh in a moment.</p> : null}
      {posters.length === 0 && !error ? (
        <div className="card empty">
          <p>No posters yet.</p>
          <Link href="/admin/posters/new" className="btn btn-primary">Add the first poster</Link>
        </div>
      ) : (
        <div className="grid-list">
          {posters.map((p) => {
            const phase = posterPhase(p, now);
            const label = phase === 'showing' ? 'Showing now' : phase === 'scheduled' ? 'Scheduled' : phase === 'ended' ? 'Ended' : POSTER_STATUSES.find((s) => s.value === p.status)?.label.split(':')[0] ?? p.status;
            return (
              <Link key={p.id} href={`/admin/posters/${p.id}`} className="row-link">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="song-title">{p.title}</div>
                  <div className="small muted">{p.requests?.contact ?? 'No request linked'}</div>
                </div>
                <span className={phase === 'showing' ? 'pill' : 'pill pill-quiet'}>{label}</span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
