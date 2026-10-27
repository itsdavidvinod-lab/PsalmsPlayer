import type { Metadata } from 'next';
import Link from 'next/link';
import Cover from '@/components/Cover';
import { requireAdmin } from '@/lib/admin';
import type { AdminSongSummary } from '@/lib/admin-types';
import { visibilityLabel } from '@/lib/admin-text';
import NameCell from '../NameCell';
import PageHead from '../PageHead';
import TableFilter from '../TableFilter';

export const metadata: Metadata = { title: 'Songs · Admin' };
export const dynamic = 'force-dynamic';

type Extra = { id: string; language_code: string | null; audio_path: string | null };

export default async function AdminSongs() {
  const { supabase } = await requireAdmin('/admin/songs');
  const [songsRes, extraRes, albumsRes, langRes] = await Promise.all([
    supabase
      .from('v_admin_songs')
      .select('id, slug, title, artist_id, artist_name, album_id, is_published, hidden_by_admin, visibility')
      .order('title'),
    supabase.from('songs').select('id, language_code, audio_path'),
    supabase.from('albums').select('id, cover_url'),
    supabase.from('languages').select('code, name'),
  ]);
  if (songsRes.error) console.error('admin songs: load failed', songsRes.error);
  const songs = (songsRes.data ?? []) as AdminSongSummary[];
  const extra = new Map(((extraRes.data ?? []) as Extra[]).map((e) => [e.id, e]));
  const covers = new Map(((albumsRes.data ?? []) as { id: string; cover_url: string | null }[]).map((a) => [a.id, a.cover_url]));
  const languages = new Map(((langRes.data ?? []) as { code: string; name: string }[]).map((l) => [l.code, l.name]));

  const artists: { value: string; label: string }[] = [];
  const seen = new Set<string>();
  for (const s of songs) {
    if (seen.has(s.artist_id)) continue;
    seen.add(s.artist_id);
    artists.push({ value: s.artist_id, label: s.artist_name });
  }
  artists.sort((a, b) => a.label.localeCompare(b.label));

  return (
    <div>
      <PageHead title="Songs" sub="Every song, with the reason it is not live." actions={<Link href="/admin/songs/new" className="btn btn-primary">New song</Link>} />
      {songsRes.error ? <p className="error adm-banner" role="alert">The list could not be loaded. Please refresh in a moment.</p> : null}
      {songs.length === 0 && !songsRes.error ? (
        <div className="card empty">
          <p>No songs yet.</p>
          <Link href="/admin/songs/new" className="btn btn-primary">Add the first song</Link>
        </div>
      ) : (
        <TableFilter
          idPrefix="song"
          searchLabel="Search songs"
          searchPlaceholder="Search by title, artist or language"
          noun="songs"
          total={songs.length}
          selects={[
            { id: 'song-show', label: 'Show', attr: 'show', options: [{ value: 'all', label: 'All songs' }, { value: 'live', label: 'Live only' }, { value: 'hidden', label: 'Not live only' }] },
            { id: 'song-filter-artist', label: 'Artist', attr: 'artist', options: [{ value: 'all', label: 'All artists' }, ...artists] },
          ]}
        >
          <div className="adm-table-wrap">
            <table className="adm-table">
              <thead>
                <tr>
                  <th scope="col">Song</th>
                  <th scope="col">Artist</th>
                  <th scope="col">Language</th>
                  <th scope="col">Status</th>
                  <th scope="col">Recording</th>
                </tr>
              </thead>
              <tbody>
                {songs.map((s) => {
                  const e = extra.get(s.id);
                  const language = e?.language_code ? languages.get(e.language_code) ?? e.language_code : '';
                  const live = s.visibility === 'live';
                  return (
                    <tr key={s.id} data-search={`${s.title} ${s.artist_name} ${language}`.toLowerCase()} data-show={live ? 'live' : 'hidden'} data-artist={s.artist_id}>
                      <td>
                        <NameCell href={`/admin/songs/${s.id}`} title={s.title} sub={`/song/${s.slug}`} cover={<Cover url={s.album_id ? covers.get(s.album_id) ?? null : null} name={s.title} size={40} />} />
                      </td>
                      <td>{s.artist_name}</td>
                      <td>{language || '—'}</td>
                      <td><span className={live ? 'pill' : 'pill pill-quiet'}>{visibilityLabel(s.visibility)}</span></td>
                      <td className="muted">{e?.audio_path ? 'Audio uploaded' : 'Lyrics only'}</td>
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
