import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArtistGrid, ArtistRow } from '@/components/ArtistRow';
import ProfileLink from '@/components/ProfileLink';
import SongList from '@/components/SongRow';
import { loadLabels, type Labels } from '@/lib/labels';
import { timeAgo } from '@/lib/relative-time';
import { hasSearch, parseSearch, type SearchState } from '@/lib/search';
import { createClient } from '@/lib/supabase/server';
import type { Artist, Song, TagKind } from '@/lib/types';
import ExploreTiles, { type TileGroup } from './ExploreTiles';
import SearchBox, { type FilterGroup } from './SearchBox';

export const metadata: Metadata = { title: 'Search' };
export const dynamic = 'force-dynamic';

const GRID_SHOWN = 8;
const RESULT_LIMIT = 40;
const LATEST_SHOWN = 3;
// A word typed into the box counts as a genre, occasion or mood only from this length, so "a" does not match half the list.
const TAG_TEXT_MIN = 3;

type Db = Awaited<ReturnType<typeof createClient>>;

function codesOf(labels: Labels, kind: TagKind): string[] {
  return labels.tags.filter((t) => t.kind === kind).map((t) => t.code);
}

/** The filters (language, genre, occasion, mood) applied to a query on songs. The query is Supabase's builder; it is passed
 *  untyped because the builder's own type changes with every call and says nothing useful here. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function narrowSongs(query: any, state: SearchState): PromiseLike<{ data: unknown; error: unknown }> {
  let q = query;
  if (state.language) q = q.eq('language_code', state.language);
  if (state.genre) q = q.contains('genres', [state.genre]);
  if (state.occasion) q = q.contains('occasions', [state.occasion]);
  if (state.mood) q = q.contains('moods', [state.mood]);
  return q;
}

/** Songs whose title or artist matches the text, or that carry a genre, occasion or mood named by it. Filters narrow all of them. */
async function findSongs(db: Db, state: SearchState, labels: Labels): Promise<{ songs: Song[]; failed: boolean }> {
  const text = state.q.toLocaleLowerCase();
  const queries: PromiseLike<{ data: unknown; error: unknown }>[] = [];

  if (state.q) {
    queries.push(narrowSongs(db.from('v_songs').select('*').ilike('title', `%${state.q}%`).limit(RESULT_LIMIT), state));
    queries.push(narrowSongs(db.from('v_songs').select('*').ilike('artist_name', `%${state.q}%`).limit(RESULT_LIMIT), state));
    if (state.q.length >= TAG_TEXT_MIN) {
      const columns: Record<TagKind, string> = { genre: 'genres', occasion: 'occasions', mood: 'moods' };
      for (const kind of ['genre', 'occasion', 'mood'] as TagKind[]) {
        const codes = labels.tags.filter((t) => t.kind === kind && (t.label.toLocaleLowerCase().includes(text) || t.code.includes(text))).map((t) => t.code);
        if (codes.length > 0) queries.push(narrowSongs(db.from('v_songs').select('*').overlaps(columns[kind], codes).limit(RESULT_LIMIT), state));
      }
    }
  } else {
    queries.push(narrowSongs(db.from('v_songs').select('*').order('title').limit(RESULT_LIMIT), state));
  }

  const results = await Promise.all(queries);
  const failed = results.some((r) => r.error);
  if (failed) console.error('search: songs failed', results.find((r) => r.error)?.error);
  const byId = new Map<string, Song>();
  for (const r of results) for (const s of (r.data ?? []) as Song[]) byId.set(s.id, s);
  const songs = Array.from(byId.values())
    .sort((a, b) => a.title.localeCompare(b.title, undefined, { sensitivity: 'base' }))
    .slice(0, RESULT_LIMIT);
  return { songs, failed };
}

async function findArtists(db: Db, state: SearchState): Promise<{ artists: Artist[]; failed: boolean }> {
  // Occasion and mood belong to songs, not artists: with one of those chosen, only songs are listed.
  if (state.occasion || state.mood) return { artists: [], failed: false };
  let query = db.from('v_artists').select('*').order('name').limit(RESULT_LIMIT);
  if (state.q) query = query.ilike('name', `%${state.q}%`);
  if (state.language) query = query.contains('language_codes', [state.language]);
  if (state.genre) query = query.contains('genres', [state.genre]);
  const res = await query;
  if (res.error) console.error('search: artists failed', res.error);
  return { artists: (res.data ?? []) as Artist[], failed: Boolean(res.error) };
}

export default async function SearchPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Fsearch');

  const labels = await loadLabels(supabase);
  const state = parseSearch(sp, {
    language: labels.languages.map((l) => l.code),
    genre: codesOf(labels, 'genre'),
    occasion: codesOf(labels, 'occasion'),
    mood: codesOf(labels, 'mood'),
  });

  const options = {
    language: labels.languages.map((l) => ({ value: l.code, label: l.name })),
    genre: labels.tags.filter((t) => t.kind === 'genre').map((t) => ({ value: t.code, label: t.label })),
    occasion: labels.tags.filter((t) => t.kind === 'occasion').map((t) => ({ value: t.code, label: t.label })),
    mood: labels.tags.filter((t) => t.kind === 'mood').map((t) => ({ value: t.code, label: t.label })),
  };
  const titles = { genre: 'Genre', occasion: 'Occasion', mood: 'Mood', language: 'Language' } as const;
  const order = ['language', 'genre', 'occasion', 'mood'] as const;
  const filterGroups: FilterGroup[] = order.filter((k) => options[k].length > 0).map((k) => ({ kind: k, title: titles[k], options: options[k] }));

  const header = (
    <div className="page-head">
      <h1>Search</h1>
      <ProfileLink />
    </div>
  );

  // ---- results
  if (hasSearch(state)) {
    const [{ songs, failed: songsFailed }, { artists, failed: artistsFailed }] = await Promise.all([findSongs(supabase, state, labels), findArtists(supabase, state)]);
    const failed = songsFailed || artistsFailed;
    return (
      <div>
        {header}
        <SearchBox state={state} groups={filterGroups} />
        {failed ? <p className="error" role="alert">Results could not be loaded. Please try again.</p> : null}

        {artists.length > 0 ? (
          <section className="section" aria-labelledby="h-artists">
            <h2 id="h-artists">Artists</h2>
            <div className="card-list">
              {artists.map((a) => (
                <ArtistRow key={a.id} artist={a} />
              ))}
            </div>
          </section>
        ) : null}

        {songs.length > 0 ? (
          <section className="section" aria-labelledby="h-songs">
            <h2 id="h-songs">Songs</h2>
            <SongList songs={songs} source="Search" />
          </section>
        ) : null}

        {songs.length === 0 && artists.length === 0 && !failed ? <div className="card empty section">Nothing found.</div> : null}
      </div>
    );
  }

  // ---- browsing: who you follow, what is new, ways to explore
  const [followedRes, latestRes] = await Promise.all([
    supabase.rpc('my_followed_artists'),
    supabase.from('v_songs').select('*').order('published_at', { ascending: false, nullsFirst: false }).limit(LATEST_SHOWN),
  ]);
  if (followedRes.error || latestRes.error) console.error('search: browse failed', followedRes.error ?? latestRes.error);
  const followed = (followedRes.data ?? []) as Artist[];
  const latest = (latestRes.data ?? []) as Song[];

  // Nobody followed yet: offer artists to follow in the same place.
  let suggestions: Artist[] = [];
  if (followed.length === 0) {
    const res = await supabase.from('v_artists').select('*').eq('available', true).order('name').limit(GRID_SHOWN);
    if (res.error) console.error('search: artists to follow failed', res.error);
    suggestions = (res.data ?? []) as Artist[];
  }

  const now = new Date();
  const latestSubs: Record<string, string> = {};
  for (const s of latest) latestSubs[s.id] = [s.artist_name, timeAgo(s.published_at, now)].filter(Boolean).join(' · ');

  const tileGroups: TileGroup[] = (['genre', 'occasion', 'mood', 'language'] as const)
    .filter((k) => options[k].length > 0)
    .map((k) => ({ kind: k, title: titles[k], tiles: options[k] }));

  return (
    <div>
      {header}
      <SearchBox state={state} groups={filterGroups} />

      {followed.length > 0 ? (
        <section className="section" aria-labelledby="h-followed">
          <h2 id="h-followed">Followed artists</h2>
          <ArtistGrid artists={followed.slice(0, GRID_SHOWN)} />
          {followed.length > GRID_SHOWN ? (
            <div className="see-more">
              <Link href="/library?tab=artists" aria-label="See all followed artists in Library">See more</Link>
            </div>
          ) : null}
        </section>
      ) : suggestions.length > 0 ? (
        <section className="section" aria-labelledby="h-tofollow">
          <h2 id="h-tofollow">Artists to follow</h2>
          <ArtistGrid artists={suggestions} />
        </section>
      ) : null}

      {latest.length > 0 ? (
        <section className="section" aria-labelledby="h-latest">
          <h2 id="h-latest">Latest releases</h2>
          <SongList songs={latest} source="Latest releases" subs={latestSubs} />
        </section>
      ) : null}

      {tileGroups.length > 0 ? (
        <section className="section" aria-labelledby="h-explore">
          <h2 id="h-explore">Explore</h2>
          <ExploreTiles groups={tileGroups} />
        </section>
      ) : null}
    </div>
  );
}
