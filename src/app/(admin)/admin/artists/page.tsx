import type { Metadata } from 'next';
import Link from 'next/link';
import Cover from '@/components/Cover';
import { requireAdmin } from '@/lib/admin';
import type { AdminArtistSummary } from '@/lib/admin-types';
import { daysLeftLabel } from '@/lib/admin-text';
import NameCell from '../NameCell';
import PageHead from '../PageHead';
import TableFilter from '../TableFilter';

export const metadata: Metadata = { title: 'Artists · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminArtists() {
  const { supabase } = await requireAdmin('/admin/artists');
  const [artistsRes, photosRes] = await Promise.all([
    supabase.from('v_admin_artists').select('*').order('name'),
    supabase.from('artists').select('id, photo_url'),
  ]);
  if (artistsRes.error) console.error('admin artists: load failed', artistsRes.error);
  const artists = (artistsRes.data ?? []) as AdminArtistSummary[];
  const photos = new Map(((photosRes.data ?? []) as { id: string; photo_url: string | null }[]).map((p) => [p.id, p.photo_url]));

  return (
    <div>
      <PageHead title="Artists" sub="Each artist, whether they are live, and how long their agreement runs." actions={<Link href="/admin/artists/new" className="btn btn-primary">New artist</Link>} />
      {artistsRes.error ? <p className="error adm-banner" role="alert">The list could not be loaded. Please refresh in a moment.</p> : null}
      {artists.length === 0 && !artistsRes.error ? (
        <div className="card empty">
          <p>No artists yet.</p>
          <Link href="/admin/artists/new" className="btn btn-primary">Add the first artist</Link>
        </div>
      ) : (
        <TableFilter
          idPrefix="artist"
          searchLabel="Search artists"
          searchPlaceholder="Search by name"
          noun="artists"
          total={artists.length}
          selects={[
            {
              id: 'artist-show',
              label: 'Show',
              attr: 'show',
              options: [
                { value: 'all', label: 'All artists' },
                { value: 'available', label: 'Available' },
                { value: 'unavailable', label: 'Unavailable' },
                { value: 'draft', label: 'Draft' },
              ],
            },
          ]}
        >
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">Artist</th>
                  <th scope="col">Status</th>
                  <th scope="col">Songs</th>
                  <th scope="col">Agreement</th>
                </tr>
              </thead>
              <tbody>
                {artists.map((a) => {
                  const group = !a.is_published ? 'draft' : a.available ? 'available' : 'unavailable';
                  return (
                    <tr key={a.id} data-search={a.name.toLowerCase()} data-show={group}>
                      <td>
                        <NameCell href={`/admin/artists/${a.id}`} title={a.name} sub={`/artist/${a.slug}`} cover={<Cover url={photos.get(a.id) ?? null} name={a.name} size={40} round />} />
                      </td>
                      <td>
                        <div className="adm-pills">
                          <span className={a.is_published ? 'pill' : 'pill pill-quiet'}>{a.is_published ? 'Published' : 'Draft'}</span>
                          {a.is_published && !a.available ? <span className="pill pill-gold">Unavailable</span> : null}
                        </div>
                      </td>
                      <td>{a.live_song_count} of {a.song_count} songs live</td>
                      <td className="muted">{daysLeftLabel(a.agreement_days_left)}</td>
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
