import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireAdmin } from '@/lib/admin';
import type { AdminAgreement, AdminAlbum, AdminArtist, AdminArtistStatus, AdminSongSummary, Option } from '@/lib/admin-types';
import { daysLeftLabel, indiaToday, isUuid, visibilityLabel } from '@/lib/admin-text';
import AgreementsSection from '../../AgreementsSection';
import AlbumForm from '../../AlbumForm';
import ArtistForm from '../../ArtistForm';
import PageHead from '../../PageHead';

export const metadata: Metadata = { title: 'Artist · Admin' };
export const dynamic = 'force-dynamic';

export default async function AdminArtistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const { supabase, user } = await requireAdmin(`/admin/artists/${id}`);

  const [artistRes, albumsRes, songsRes, langRes, regionRes, tagRes, agreementsRes, statusRes] = await Promise.all([
    supabase.from('artists').select('id, slug, name, bio, photo_url, language_codes, region_code, genres, is_published').eq('id', id).maybeSingle(),
    supabase.from('albums').select('id, slug, title, kind, release_year, cover_url, is_published').eq('artist_id', id).order('created_at'),
    supabase.from('v_admin_songs').select('id, slug, title, artist_id, artist_name, album_id, is_published, hidden_by_admin, visibility').eq('artist_id', id).order('title'),
    supabase.from('languages').select('code, name, native_name').order('name'),
    supabase.from('regions').select('code, name').order('name'),
    supabase.from('tags').select('code, label').eq('kind', 'genre').order('label'),
    supabase.from('agreements').select('*').eq('artist_id', id).order('created_at', { ascending: false }),
    supabase.from('v_admin_artists').select('available, agreement_expires_on, agreement_days_left').eq('id', id).maybeSingle(),
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
  const agreements = (agreementsRes.data ?? []) as AdminAgreement[];
  const standing = statusRes.data as AdminArtistStatus | null;
  const failed = Boolean(albumsRes.error || songsRes.error || langRes.error || regionRes.error || tagRes.error || agreementsRes.error || statusRes.error);
  const reasons: string[] = [];
  if (!artist.is_published) reasons.push('the artist is not published');
  if (!standing?.agreement_expires_on) reasons.push('no verified agreement is in force');

  return (
    <div>
      <PageHead title={artist.name} crumbs={<Link href="/admin/artists" className="inline">Artists</Link>} />
      {failed ? <p className="error adm-banner" role="alert">Some parts of this page could not be loaded. Please refresh.</p> : null}

      <div className={`${standing?.available ? 'ok' : 'notice'} adm-banner`} role="status" aria-label="Artist status">
        {standing?.available ? (
          <strong>
            Available: users can find this artist. The agreement in force ends on {standing.agreement_expires_on} ({daysLeftLabel(standing.agreement_days_left)}).
          </strong>
        ) : (
          <strong>Not available to users: {reasons.length > 0 ? reasons.join(' and ') : 'the status could not be read'}.</strong>
        )}
      </div>

      <div className="adm-cols">
        <div className="adm-main-col">
          <section className="section" aria-labelledby="profile">
            <h2 id="profile">Profile</h2>
            <ArtistForm artist={artist} languages={languages} regions={regions} genres={genres} />
          </section>

          <section className="section" aria-labelledby="albums">
            <h2 id="albums">Albums</h2>
            {albums.length === 0 ? <p className="muted small">No albums yet.</p> : null}
            <div className="grid-list">
              {albums.map((al) => (
                <details key={al.id} className="card">
                  <summary>
                    {al.title}{' '}
                    <span className={al.is_published ? 'pill' : 'pill pill-quiet'}>{al.is_published ? 'Published' : 'Draft'}</span>
                  </summary>
                  <AlbumForm artistId={artist.id} album={al} />
                </details>
              ))}
            </div>
            <details className="card" style={{ marginTop: 8 }}>
              <summary>Add an album</summary>
              <AlbumForm artistId={artist.id} album={null} />
            </details>
          </section>

          <section className="section" aria-labelledby="songs">
            <h2 id="songs">Songs</h2>
            {songs.length === 0 ? (
              <p className="muted small">No songs yet.</p>
            ) : (
              <div className="adm-rows">
                {songs.map((s) => (
                  <Link key={s.id} href={`/admin/songs/${s.id}`} className="row-link">
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div className="song-title">{s.title}</div>
                    </div>
                    <span className={s.visibility === 'live' ? 'pill' : 'pill pill-quiet'}>{visibilityLabel(s.visibility)}</span>
                  </Link>
                ))}
              </div>
            )}
            <p style={{ margin: '16px 0 0' }}>
              <Link href={`/admin/songs/new?artist=${artist.id}`} className="btn btn-primary">Add a song</Link>
            </p>
          </section>
        </div>

        <div className="adm-side-col">
          <section className="section" aria-labelledby="agreements">
            <h2 id="agreements">Agreements</h2>
            <AgreementsSection artistId={artist.id} adminId={user.id} agreements={agreements} today={indiaToday(new Date())} />
          </section>
        </div>
      </div>
    </div>
  );
}
