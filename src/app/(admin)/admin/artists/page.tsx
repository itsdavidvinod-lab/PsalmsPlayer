import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import type { AdminArtistSummary } from '@/lib/admin-types';
import { daysLeftLabel } from '@/lib/admin-text';

export const metadata: Metadata = { title: 'Artists · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminArtists() {
  const { supabase } = await requireAdmin('/admin/artists');
  const { data, error } = await supabase.from('v_admin_artists').select('*').order('name');
  if (error) console.error('admin artists: load failed', error);
  const artists = (data ?? []) as AdminArtistSummary[];

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: 'space-between', marginTop: 20 }}>
        <h1 style={{ fontSize: '1.6rem' }}>Artists</h1>
        <Link href="/admin/artists/new" className="btn btn-primary">New artist</Link>
      </div>
      {error ? <p className="error" role="alert">The list could not be loaded. Please refresh in a moment.</p> : null}
      {artists.length === 0 && !error ? (
        <div className="card empty">
          <p>No artists yet.</p>
          <Link href="/admin/artists/new" className="btn btn-primary">Add the first artist</Link>
        </div>
      ) : (
        <div className="grid-list">
          {artists.map((a) => (
            <Link key={a.id} href={`/admin/artists/${a.id}`} className="row-link">
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="song-title">{a.name}</div>
                <div className="small muted">
                  {a.live_song_count} of {a.song_count} songs live · {daysLeftLabel(a.agreement_days_left)}
                </div>
              </div>
              <div className="pills" style={{ marginTop: 0 }}>
                <span className={a.is_published ? 'pill' : 'pill pill-quiet'}>{a.is_published ? 'Published' : 'Draft'}</span>
                {a.is_published && !a.available ? <span className="pill pill-gold">Unavailable</span> : null}
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
