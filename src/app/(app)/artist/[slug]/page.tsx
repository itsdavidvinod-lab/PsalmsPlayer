import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import Cover from '@/components/Cover';
import SongList from '@/components/SongRow';
import { createClient } from '@/lib/supabase/server';
import type { Album, Artist, Song } from '@/lib/types';

export const metadata: Metadata = { title: 'Artist' };
export const dynamic = 'force-dynamic';

export default async function ArtistPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent('/artist/' + slug)}`);

  // v_artists lists published artists only. An unpublished artist is "not found".
  const { data: artistRow } = await supabase.from('v_artists').select('*').eq('slug', slug).maybeSingle();
  if (!artistRow) notFound();
  const artist = artistRow as Artist;

  // An artist whose agreement is not in force keeps a name and a placeholder. The reason (and any date) is never shown.
  if (!artist.available) {
    return (
      <div>
        <div className="hero">
          <Cover url={null} name={artist.name} size={96} round />
          <div>
            <h1>{artist.name}</h1>
            <span className="pill pill-gold">Unavailable</span>
          </div>
        </div>
        <p className="notice section">This artist&apos;s songs are not available right now.</p>
      </div>
    );
  }

  const [songsRes, albumsRes, listenersRes] = await Promise.all([
    supabase
      .from('v_songs')
      .select('*')
      .eq('artist_id', artist.id)
      .order('like_count', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(10),
    supabase.from('v_albums').select('*').eq('artist_id', artist.id).order('release_year', { ascending: false }),
    supabase.rpc('artist_monthly_listeners', { p_artist: artist.id }),
  ]);
  if (songsRes.error || albumsRes.error) console.error('artist: load failed', songsRes.error ?? albumsRes.error);
  const songs = (songsRes.data ?? []) as Song[];
  const albums = (albumsRes.data ?? []) as Album[];
  // Null when fewer than 10 people listened, so tiny numbers are never shown.
  const listeners = typeof listenersRes.data === 'number' ? listenersRes.data : null;

  return (
    <div>
      <div className="hero">
        <Cover url={artist.photo_url} name={artist.name} size={96} round />
        <div>
          <h1>{artist.name}</h1>
          {listeners !== null ? <p className="muted" style={{ margin: '4px 0 0' }}>{listeners.toLocaleString('en-IN')} monthly listeners</p> : null}
        </div>
      </div>
      {artist.genres.length > 0 ? (
        <div className="pills">
          {artist.genres.map((g) => (
            <span key={g} className="pill">{g}</span>
          ))}
        </div>
      ) : null}
      {artist.bio ? <p className="section">{artist.bio}</p> : null}

      {songs.length > 0 ? (
        <section className="section" aria-labelledby="popular">
          <h2 id="popular">Popular songs</h2>
          <SongList songs={songs} />
        </section>
      ) : null}

      {albums.length > 0 ? (
        <section className="section" aria-labelledby="albums">
          <h2 id="albums">Albums</h2>
          <div className="grid-list">
            {albums.map((a) => (
              <Link key={a.id} href={`/album/${a.slug}`} className="row-link">
                <Cover url={a.cover_url} name={a.title} />
                <div>
                  <div className="song-title">{a.title}</div>
                  <div className="small muted">
                    {a.kind}
                    {a.release_year ? ` · ${a.release_year}` : ''}
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {songs.length === 0 && albums.length === 0 ? <div className="card empty section">No songs are available yet.</div> : null}
    </div>
  );
}
