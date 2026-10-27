import Link from 'next/link';
import { redirect } from 'next/navigation';
import Avatar from '@/components/Avatar';
import { ArtistStrip } from '@/components/ArtistRow';
import { HeartIcon } from '@/components/icons';
import PosterCarousel, { type PosterSlide } from '@/components/PosterCarousel';
import SongList from '@/components/SongRow';
import { displayImageUrl } from '@/lib/image-url';
import { createClient } from '@/lib/supabase/server';
import type { Artist, Poster, Profile, Song } from '@/lib/types';
import { pictureFromMetadata } from '@/lib/user';
import { youtubeWatchUrl } from '@/lib/youtube';

export const dynamic = 'force-dynamic';

const ARTISTS_SHOWN = 12;

type Result = { data: unknown; error: unknown };

function rows<T>(res: Result, label: string, problems: string[]): T[] {
  if (res.error) {
    console.error(`home: ${label} failed`, res.error);
    problems.push(label);
    return [];
  }
  return (res.data ?? []) as T[];
}

function SongSection({ title, songs }: { title: string; songs: Song[] }) {
  if (songs.length === 0) return null;
  return (
    <section className="section" aria-labelledby={`h-${title}`}>
      <h2 id={`h-${title}`}>{title}</h2>
      <SongList songs={songs} source={title} />
    </section>
  );
}

export default async function HomePage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profileRow } = await supabase
    .from('profiles')
    .select('display_name, role, language_codes, region_code')
    .eq('id', user.id)
    .maybeSingle();
  const profile = (profileRow ?? { display_name: null, role: 'user', language_codes: [], region_code: null }) as Profile;

  const filters = { p_languages: profile.language_codes, p_region: profile.region_code };
  const [postersRes, trendingRes, likedRes, suggestedRes, followedRes, artistsRes] = await Promise.all([
    supabase.rpc('home_posters', { ...filters, p_limit: 6 }),
    supabase.rpc('trending_songs', { ...filters, p_limit: 10 }),
    supabase.rpc('most_liked_songs', { ...filters, p_limit: 10 }),
    supabase.rpc('suggested_songs', { p_limit: 10 }),
    supabase.rpc('my_followed_artists'),
    supabase.from('v_artists').select('*').eq('available', true).order('name').limit(ARTISTS_SHOWN),
  ]);

  const problems: string[] = [];
  const posters = rows<Poster>(postersRes, 'posters', problems);
  const trending = rows<Song>(trendingRes, 'trending', problems);
  const mostLiked = rows<Song>(likedRes, 'most liked', problems);
  const suggested = rows<Song>(suggestedRes, 'suggested', problems);

  // The artists you follow come first, then the others, by name. An artist who is not available is left out.
  const followed = rows<Artist>(followedRes, 'followed artists', problems).filter((a) => a.available);
  const seen = new Set(followed.map((a) => a.id));
  const artists = [...followed, ...rows<Artist>(artistsRes, 'artists', problems).filter((a) => !seen.has(a.id))].slice(0, ARTISTS_SHOWN);

  // Pictures only: the title stays as the accessible name. A poster with a YouTube link opens it when tapped.
  const slides: PosterSlide[] = posters.map((p) => ({
    id: p.id,
    title: p.title,
    image: displayImageUrl(p.image_url, 1000),
    href: p.youtube_id ? youtubeWatchUrl(p.youtube_id) : null,
  }));

  const noPreferences = profile.language_codes.length === 0 && !profile.region_code;
  const nothingToShow = posters.length + artists.length + trending.length + mostLiked.length + suggested.length === 0;

  return (
    <div>
      <div className="page-head page-head-home">
        <h1>{profile.display_name ? `Welcome, ${profile.display_name}` : 'Welcome'}</h1>
        <Link href="/library/liked" className="pill-btn" aria-label="Liked songs">
          <HeartIcon size={16} filled /> Liked
        </Link>
        <Link href="/settings" className="avatar-link" aria-label="Profile">
          <Avatar name={profile.display_name ?? user.email ?? null} url={pictureFromMetadata(user.user_metadata)} size={32} />
        </Link>
      </div>

      {problems.length > 0 ? (
        <p className="error" role="alert">Some sections could not be loaded. Please refresh in a moment.</p>
      ) : null}

      {noPreferences ? (
        <p className="notice">
          Choose your language and region in <Link href="/settings"><strong>Settings</strong></Link> to see songs and notices that fit you.
        </p>
      ) : null}

      {slides.length > 0 ? (
        <section className="section poster-section" aria-label="Notices and events">
          <PosterCarousel slides={slides} />
        </section>
      ) : null}

      {artists.length > 0 ? (
        <section className="section" aria-labelledby="h-artists">
          <h2 id="h-artists">Artists</h2>
          <ArtistStrip artists={artists} />
        </section>
      ) : null}

      <SongSection title="Trending" songs={trending} />
      <SongSection title="Suggested for you" songs={suggested} />
      <SongSection title="Most liked" songs={mostLiked} />

      {nothingToShow && problems.length === 0 ? (
        <div className="card empty section">
          <p>No songs are available yet.</p>
        </div>
      ) : null}
    </div>
  );
}
