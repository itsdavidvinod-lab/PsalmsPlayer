import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import Cover from '@/components/Cover';
import Header from '@/components/Header';
import SongRow from '@/components/SongRow';
import { createClient } from '@/lib/supabase/server';
import type { Album, Song } from '@/lib/types';

export const metadata: Metadata = { title: 'Album' };
export const dynamic = 'force-dynamic';

export default async function AlbumPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent('/album/' + slug)}`);

  // v_albums only lists published albums of available artists.
  const { data: albumRow } = await supabase.from('v_albums').select('*').eq('slug', slug).maybeSingle();
  if (!albumRow) notFound();
  const album = albumRow as Album;

  const { data, error } = await supabase.from('v_songs').select('*').eq('album_id', album.id).order('track_no', { ascending: true });
  if (error) console.error('album: songs failed', error);
  const songs = (data ?? []) as Song[];

  return (
    <div className="wrap">
      <Header />
      <div className="hero">
        <Cover url={album.cover_url} name={album.title} size={96} />
        <div>
          <h1>{album.title}</h1>
          <p className="muted" style={{ margin: '4px 0 0' }}>
            <Link href={`/artist/${album.artist_slug}`} className="inline">{album.artist_name}</Link>
            {album.release_year ? ` · ${album.release_year}` : ''}
          </p>
        </div>
      </div>

      <section className="section" aria-label="Tracks">
        {songs.length > 0 ? (
          <div className="song-list">
            {songs.map((s) => (
              <SongRow key={s.id} song={s} />
            ))}
          </div>
        ) : (
          <div className="card empty">No songs from this album are available right now.</div>
        )}
      </section>
    </div>
  );
}
