import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import type { AdminAlbum, AdminArtist, AdminSongSummary, Option } from '@/lib/admin-types';
import { isUuid, visibilityLabel } from '@/lib/admin-text';
import AlbumForm from '../../AlbumForm';
import ArtistForm from '../../ArtistForm';

export const metadata: Metadata = { title: 'Artist · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase } = await requireAdmin(`/admin/artists/${id}`);

  const [artistRes, albumsRes, songsRes, langRes, regionRes, tagRes] = await Promise.all([
    supabase.from('artists').select('id, slug, name, bio, photo_url, language_codes, region_code, genres, is_published').eq('id', id).maybeSingle(),
    supabase.from('albums').select('id, slug, title, kind, release_year, cover_url, is_published').eq('artist_id', id).order('created_at'),
    supabase.from('v_admin_songs').select('id, slug, title, artist_id, artist_name, album_id, is_published, hidden_by_admin, visibility').eq('artist_id', id).order('title'),
    supabase.from('languages').select('code, name, native_name').order('name'),
    supabase.from('regions').select('code, name').order('name'),
    supabase.from('tags').select('code, label').eq('kind', 'genre').order('label'),
  ]);
  if (!artistRes.data) notFound();

  const artist = artistRes.data as AdminArtist;
  const albums = (albumsRes.data ?? []) as AdminAlbum[];
  const songs = (songsRes.data ?? []) as AdminSongSummary[];
  const languages: Option[] = (langRes.data ?? []).map((l: { code: string; name: string; native_name: string | null }) => ({
    value: l.code,
    label: l.native_name && l.native_name !== l.name ? `${l.name} · ${l.native_name}` : l.name,
  }));
  const regions: Option[] = (regionRes.data ?? []).map((r: { code: string; name: string }) => ({ value: r.code, label: r.name }));
  const genres: Option[] = (tagRes.data ?? []).map((t: { code: string; label: string }) => ({ value: t.code, label: t.label }));
  const failed = Boolean(albumsRes.error || songsRes.error || langRes.error || regionRes.error || tagRes.error);

  return (
    <div>
      <p className="small" style={{ margin: '16px 0 0' }}><Link href="/admin/artists" className="inline">Artists</Link></p>
      <h1 style={{ fontSize: '1.6rem', margin: '4px 0 12px' }}>{artist.name}</h1>
      {failed ? <p className="error" role="alert">Some parts of this page could not be loaded. Please refresh.</p> : null}

      <ArtistForm artist={artist} languages={languages} regions={regions} genres={genres} />

      <section className="section" aria-labelledby="albums">
        <h2 id="albums">Albums</h2>
        {albums.length === 0 ? <p className="muted small">No albums yet.</p> : null}
        <div className="grid-list">
          {albums.map((al) => (
            <details key={al.id} className="card">
              <summary style={{ cursor: 'pointer', fontWeight: 600 }}>
                {al.title}{' '}
                <span className={al.is_published ? 'pill' : 'pill pill-quiet'}>{al.is_published ? 'Published' : 'Draft'}</span>
              </summary>
              <AlbumForm artistId={artist.id} album={al} />
            </details>
          ))}
        </div>
        <details className="card" style={{ marginTop: 8 }}>
          <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Add an album</summary>
          <AlbumForm artistId={artist.id} album={null} />
        </details>
      </section>

      <section className="section" aria-labelledby="songs">
        <h2 id="songs">Songs</h2>
        {songs.length === 0 ? (
          <p className="muted small">No songs yet.</p>
        ) : (
          <div className="grid-list">
            {songs.map((s) => (
              <div key={s.id} className="row-link">
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="song-title">{s.title}</div>
                </div>
                <span className={s.visibility === 'live' ? 'pill' : 'pill pill-quiet'}>{visibilityLabel(s.visibility)}</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
