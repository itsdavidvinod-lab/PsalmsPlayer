import type { Metadata } from 'next';
import Link from 'next/link';
import Cover from '@/components/Cover';
import { requireAdmin } from '@/lib/admin';
import { POSTER_KINDS, POSTER_STATUSES, isoToIstInput, posterPhase } from '@/lib/ledger';
import NameCell from '../NameCell';
import PageHead from '../PageHead';
import TableFilter from '../TableFilter';

export const metadata: Metadata = { title: 'Posters · Admin' };
export const dynamic = 'force-dynamic';

type Row = {
  id: string;
  title: string;
  kind: string;
  image_url: string | null;
  status: string;
  starts_at: string | null;
  ends_at: string | null;
  event_date: string | null;
  requests: { contact: string } | null;
};

/** "2026-10-27T18:30" (India time) as "27 Oct 2026, 18:30". */
function istText(iso: string | null): string {
  const v = isoToIstInput(iso);
  if (!v) return '';
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const month = months[Number(v.slice(5, 7)) - 1] ?? '';
  return `${Number(v.slice(8, 10))} ${month} ${v.slice(0, 4)}, ${v.slice(11, 16)}`;
}

export default async function AdminPosters() {
  const { supabase } = await requireAdmin('/admin/posters');
  const { data, error } = await supabase
    .from('posters')
    .select('id, title, kind, image_url, status, starts_at, ends_at, event_date, requests(contact)')
    .order('created_at', { ascending: false });
  if (error) console.error('admin posters: load failed', error);
  const posters = (data ?? []) as unknown as Row[];
  const now = Date.now();

  return (
    <div>
      <PageHead
        title="Posters"
        sub="Posters appear on Home only while they are Approved and inside their dates. Users never see the dates or any amount."
        actions={<Link href="/admin/posters/new" className="btn btn-primary">New poster</Link>}
      />
      {error ? <p className="error adm-banner" role="alert">The list could not be loaded. Please refresh in a moment.</p> : null}
      {posters.length === 0 && !error ? (
        <div className="card empty">
          <p>No posters yet.</p>
          <Link href="/admin/posters/new" className="btn btn-primary">Add the first poster</Link>
        </div>
      ) : (
        <TableFilter
          idPrefix="poster"
          searchLabel="Search posters"
          searchPlaceholder="Search by title or contact"
          noun="posters"
          total={posters.length}
          selects={[
            {
              id: 'poster-show',
              label: 'Show',
              attr: 'phase',
              options: [
                { value: 'all', label: 'All posters' },
                { value: 'showing', label: 'Showing now' },
                { value: 'scheduled', label: 'Scheduled' },
                { value: 'ended', label: 'Ended' },
                { value: 'off', label: 'Not approved' },
              ],
            },
          ]}
        >
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">Poster</th>
                  <th scope="col">Kind</th>
                  <th scope="col">Request</th>
                  <th scope="col">Status</th>
                  <th scope="col">Shown (India time)</th>
                </tr>
              </thead>
              <tbody>
                {posters.map((p) => {
                  const phase = posterPhase(p, now);
                  const label =
                    phase === 'showing' ? 'Showing now' : phase === 'scheduled' ? 'Scheduled' : phase === 'ended' ? 'Ended' : POSTER_STATUSES.find((s) => s.value === p.status)?.label.split(':')[0] ?? p.status;
                  const kind = POSTER_KINDS.find((k) => k.value === p.kind)?.label.split(' (')[0] ?? p.kind;
                  const contact = p.requests?.contact ?? 'No request linked';
                  const from = istText(p.starts_at);
                  const to = istText(p.ends_at);
                  return (
                    <tr key={p.id} data-search={`${p.title} ${contact} ${kind}`.toLowerCase()} data-phase={phase}>
                      <td>
                        <NameCell href={`/admin/posters/${p.id}`} title={p.title} cover={<Cover url={p.image_url} name={p.title} size={40} />} />
                      </td>
                      <td>{kind}</td>
                      <td className="muted">{contact}</td>
                      <td><span className={phase === 'showing' ? 'pill' : 'pill pill-quiet'}>{label}</span></td>
                      <td className="muted">{from || to ? `${from || 'Any time'} → ${to || 'No end'}` : 'Always, once approved'}</td>
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
