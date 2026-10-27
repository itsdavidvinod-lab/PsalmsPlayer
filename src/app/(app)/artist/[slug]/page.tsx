import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import BackButton from '@/components/BackButton';
import Cover from '@/components/Cover';
import { HeartIcon } from '@/components/icons';
import SongList from '@/components/SongRow';
import { heroBackground } from '@/lib/cover';
import { displayImageUrl } from '@/lib/image-url';
import { formatClock } from '@/lib/format';
import { loadLabels } from '@/lib/labels';
import { likesLabel, listenersLabel, songCountLabel } from '@/lib/list';
import { createClient } from '@/lib/supabase/server';
import type { Album, Artist, Song } from '@/lib/types';
import { FollowButton, PlayControls } from './ArtistActions';

export const metadata: Metadata = { title: 'Artist' };
export const dynamic = 'force-dynamic';

const POPULAR_SHOWN = 10;

function Hero({ name, photo }: { name: string; photo: string | null }) {
  return (
    <div className="artist-hero" style={{ background: heroBackground(name) }}>
      {displayImageUrl(photo, 1200) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img className="artist-hero-img" src={displayImageUrl(photo, 1200) ?? undefined} alt="" referrerPolicy="no-referrer" />
      ) : null}
      <div className="artist-hero-shade" aria-hidden="true" />
      <BackButton fallback="/search" className="round-back artist-back" />
      <h1>{name}</h1>
    </div>
  );
}

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

  // Your own follow, if any (the table only ever shows you your own rows).
  const followRes = await supabase.from('artist_follows').select('artist_id').eq('artist_id', artist.id).maybeSingle();
  const following = Boolean(followRes.data);

  // An artist whose agreement is not in force keeps a name and a placeholder. The reason (and any date) is never shown.
  // Someone who already follows them can still stop following.
  if (!artist.available) {
    return (
      <div className="artist-page">
        <Hero name={artist.name} photo={null} />
        <div className="artist-body">
          <div className="artist-actions">
            {following ? <FollowButton artistId={artist.id} userId={user.id} initial /> : null}
            <span className="artist-actions-gap" />
            <span className="pill pill-gold">Unavailable</span>
          </div>
          <p className="notice section">This artist&apos;s songs are not available right now.</p>
        </div>
      </div>
    );
  }

  const [songsRes, albumsRes, listenersRes, likedRes, labels] = await Promise.all([
    supabase
      .from('v_songs')
      .select('*')
      .eq('artist_id', artist.id)
      .order('like_count', { ascending: false })
      .order('published_at', { ascending: false })
      .limit(100),
    supabase.from('v_albums').select('*').eq('artist_id', artist.id).order('release_year', { ascending: false }),
    // p_min 0: the exact number is shown to every signed-in person, however small (an unavailable artist never reaches this line).
    supabase.rpc('artist_monthly_listeners', { p_artist: artist.id, p_min: 0 }),
    supabase.rpc('my_liked_songs').eq('artist_id', artist.id).select('id'),
    loadLabels(supabase),
  ]);
  if (songsRes.error || albumsRes.error) console.error('artist: load failed', songsRes.error ?? albumsRes.error);
  const songs = (songsRes.data ?? []) as Song[];
  const albums = (albumsRes.data ?? []) as Album[];
  const listeners = typeof listenersRes.data === 'number' ? listenersRes.data : null;
  // Likes on all of the artist's live songs (the list above holds up to 100 songs).
  const totalLikes = songs.reduce((sum, s) => sum + (s.like_count ?? 0), 0);
  const likedCount = Array.isArray(likedRes.data) ? likedRes.data.length : 0;

  const popular = songs.slice(0, POPULAR_SHOWN);
  const subs: Record<string, string> = {};
  for (const s of popular) {
    subs[s.id] = [labels.languageName(s.language_code), s.duration_s ? formatClock(s.duration_s) : ''].filter(Boolean).join(' · ');
  }

  return (
    <div className="artist-page">
      <Hero name={artist.name} photo={artist.photo_url} />
      <div className="artist-body">
        <p className="artist-stats">
          {listeners !== null ? <span className="artist-listeners">{listenersLabel(listeners)}</span> : null}
          <span className="artist-likes">{likesLabel(totalLikes)}</span>
        </p>

        <div className="artist-actions">
          <FollowButton artistId={artist.id} userId={user.id} initial={following} />
          <span className="artist-actions-gap" />
          <PlayControls artistId={artist.id} artistName={artist.name} songs={songs} />
        </div>

        {likedCount > 0 ? (
          <Link href={`/library/liked?artist=${encodeURIComponent(artist.slug)}`} className="liked-card">
            <span className="liked-card-pic" style={{ background: 'radial-gradient(circle at 30% 25%, rgba(255,255,255,0.25), transparent 55%), linear-gradient(135deg, #2d3a8c, #6b3fa0)' }} aria-hidden="true">
              <span className="liked-card-badge"><HeartIcon size={10} filled /></span>
            </span>
            <span>
              <span className="liked-card-title">You liked</span>
              <span className="liked-card-sub">{songCountLabel(likedCount)} · {artist.name}</span>
            </span>
          </Link>
        ) : null}

        {popular.length > 0 ? (
          <section className="section" aria-labelledby="popular">
            <h2 id="popular">Popular</h2>
            <SongList songs={popular} queue={songs} source={artist.name} ranked subs={subs} />
          </section>
        ) : null}

        {albums.length > 0 ? (
          <section className="section" aria-labelledby="albums">
            <h2 id="albums">Albums</h2>
            <div className="card-list">
              {albums.map((a) => (
                <Link key={a.id} href={`/album/${a.slug}`} className="card-row">
                  <Cover url={a.cover_url} name={a.title} size={40} />
                  <span className="card-row-text">
                    <span className="card-row-title">{a.title}</span>
                    <span className="card-row-sub">
                      {a.kind}
                      {a.release_year ? ` · ${a.release_year}` : ''}
                    </span>
                  </span>
                </Link>
              ))}
            </div>
          </section>
        ) : null}

        {artist.bio || artist.genres.length > 0 ? (
          <section className="section" aria-labelledby="about">
            <h2 id="about">About</h2>
            {artist.genres.length > 0 ? (
              <div className="pills">
                {artist.genres.map((g) => (
                  <span key={g} className="pill">{labels.tagLabel('genre', g)}</span>
                ))}
              </div>
            ) : null}
            {artist.bio ? <p className="artist-bio">{artist.bio}</p> : null}
          </section>
        ) : null}

        {songs.length === 0 && albums.length === 0 ? <div className="card empty section">No songs are available yet.</div> : null}
      </div>
    </div>
  );
}
