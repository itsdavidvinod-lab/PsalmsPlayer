import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import Cover from '@/components/Cover';
import Header from '@/components/Header';
import SongRow from '@/components/SongRow';
import { createClient } from '@/lib/supabase/server';
import type { Artist, Language, Song } from '@/lib/types';

export const metadata: Metadata = { title: 'Browse' };
export const dynamic = 'force-dynamic';

/** Keeps the search text to plain characters so it can only widen or narrow the match, never change the query. */
function cleanQuery(q: string | undefined): string {
  return (q ?? '').replace(/[^\p{L}\p{N}\s'-]/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, 60);
}

export default async function BrowsePage({ searchParams }: { searchParams: Promise<{ q?: string; language?: string }> }) {
  const sp = await searchParams;
  const q = cleanQuery(sp.q);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Fbrowse');

  const langsRes = await supabase.from('languages').select('code, name, native_name').order('name');
  const languages = (langsRes.data ?? []) as Language[];
  const language = languages.some((l) => l.code === sp.language) ? sp.language : undefined;

  let songsQuery = supabase.from('v_songs').select('*').order('title').limit(40);
  let artistsQuery = supabase.from('v_artists').select('*').order('name').limit(40);
  if (q) {
    songsQuery = songsQuery.ilike('title', `%${q}%`);
    artistsQuery = artistsQuery.ilike('name', `%${q}%`);
  }
  if (language) {
    songsQuery = songsQuery.eq('language_code', language);
    artistsQuery = artistsQuery.contains('language_codes', [language]);
  }
  const [songsRes, artistsRes] = await Promise.all([songsQuery, artistsQuery]);
  if (songsRes.error || artistsRes.error) console.error('browse: load failed', songsRes.error ?? artistsRes.error);
  const songs = (songsRes.data ?? []) as Song[];
  const artists = (artistsRes.data ?? []) as Artist[];

  return (
    <div className="wrap">
      <Header />
      <h1 style={{ fontSize: '1.6rem', margin: '8px 0 0' }}>Browse</h1>
      <form className="search" role="search" action="/browse" method="get">
        <input className="input" type="search" name="q" defaultValue={q} placeholder="Search songs and artists" aria-label="Search songs and artists" maxLength={60} />
        <select className="input" name="language" defaultValue={language ?? ''} aria-label="Language">
          <option value="">All languages</option>
          {languages.map((l) => (
            <option key={l.code} value={l.code}>{l.name}</option>
          ))}
        </select>
        <button type="submit" className="btn btn-primary">Search</button>
      </form>

      {songsRes.error || artistsRes.error ? <p className="error" role="alert">Results could not be loaded. Please try again.</p> : null}

      {artists.length > 0 ? (
        <section className="section" aria-labelledby="artists">
          <h2 id="artists">Artists</h2>
          <div className="grid-list">
            {artists.map((a) => (
              <Link key={a.id} href={`/artist/${a.slug}`} className="row-link">
                <Cover url={a.available ? a.photo_url : null} name={a.name} round />
                <div>
                  <div className="song-title">{a.name}</div>
                  {a.available ? null : <span className="pill pill-gold">Unavailable</span>}
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : null}

      {songs.length > 0 ? (
        <section className="section" aria-labelledby="songs">
          <h2 id="songs">Songs</h2>
          <div className="song-list">
            {songs.map((s) => (
              <SongRow key={s.id} song={s} />
            ))}
          </div>
        </section>
      ) : null}

      {songs.length === 0 && artists.length === 0 && !songsRes.error ? <div className="card empty section">Nothing found.</div> : null}
    </div>
  );
}
