import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import SongList from '@/components/SongRow';
import { createClient } from '@/lib/supabase/server';
import type { Song } from '@/lib/types';
import NewListForm from './NewListForm';

export const metadata: Metadata = { title: 'Library' };
export const dynamic = 'force-dynamic';

type ListRow = { id: string; name: string; kind: 'playlist' | 'setlist'; service_date: string | null; playlist_items: { count: number }[] };

export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Flibrary');

  const [listsRes, likedRes] = await Promise.all([
    supabase.from('playlists').select('id, name, kind, service_date, playlist_items(count)').order('created_at', { ascending: false }),
    supabase.rpc('my_liked_songs'),
  ]);
  if (listsRes.error || likedRes.error) console.error('library: load failed', listsRes.error ?? likedRes.error);
  const lists = (listsRes.data ?? []) as unknown as ListRow[];
  const liked = (likedRes.data ?? []) as Song[];

  return (
    <div>
      <h1 style={{ fontSize: '1.6rem', margin: '8px 0 0' }}>Library</h1>
      {listsRes.error || likedRes.error ? <p className="error" role="alert">Your library could not be loaded. Please refresh in a moment.</p> : null}

      <section className="section" aria-labelledby="lists">
        <h2 id="lists">Playlists and setlists</h2>
        <NewListForm userId={user.id} />
        {lists.length > 0 ? (
          <div className="grid-list" style={{ marginTop: 12 }}>
            {lists.map((l) => (
              <Link key={l.id} href={`/library/${l.id}`} className="row-link">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="song-title">{l.name}</div>
                  <div className="small muted">
                    {l.kind === 'setlist' ? 'Setlist' : 'Playlist'}
                    {l.service_date ? ` · ${l.service_date}` : ''}
                    {` · ${l.playlist_items[0]?.count ?? 0} songs`}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <p className="muted small" style={{ marginTop: 12 }}>No lists yet. Make a playlist to listen, or a setlist for a service.</p>
        )}
      </section>

      <section className="section" aria-labelledby="liked">
        <h2 id="liked">Liked songs</h2>
        {liked.length > 0 ? <SongList songs={liked} /> : <div className="card empty">Songs you like appear here.</div>}
      </section>
    </div>
  );
}
