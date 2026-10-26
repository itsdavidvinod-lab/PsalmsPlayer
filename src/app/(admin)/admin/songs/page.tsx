import type { Metadata } from 'next';
import Link from 'next/link';
import { requireAdmin } from '@/lib/admin';
import type { AdminSongSummary } from '@/lib/admin-types';
import SongTable from '../SongTable';

export const metadata: Metadata = { title: 'Songs · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminSongs() {
  const { supabase } = await requireAdmin('/admin/songs');
  const { data, error } = await supabase
    .from('v_admin_songs')
    .select('id, slug, title, artist_id, artist_name, album_id, is_published, hidden_by_admin, visibility')
    .order('title');
  if (error) console.error('admin songs: load failed', error);
  const songs = (data ?? []) as AdminSongSummary[];

  return (
    <div>
      <div className="toolbar" style={{ justifyContent: 'space-between', marginTop: 20 }}>
        <h1 style={{ fontSize: '1.6rem' }}>Songs</h1>
        <Link href="/admin/songs/new" className="btn btn-primary">New song</Link>
      </div>
      {error ? <p className="error" role="alert">The list could not be loaded. Please refresh in a moment.</p> : null}
      {songs.length === 0 && !error ? (
        <div className="card empty">
          <p>No songs yet.</p>
          <Link href="/admin/songs/new" className="btn btn-primary">Add the first song</Link>
        </div>
      ) : (
        <SongTable songs={songs} />
      )}
    </div>
  );
}
