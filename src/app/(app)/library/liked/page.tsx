import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { loadLabels } from '@/lib/labels';
import { createClient } from '@/lib/supabase/server';
import type { PlaylistRow, Song } from '@/lib/types';
import ListView from '../ListView';

export const metadata: Metadata = { title: 'Liked songs' };
export const dynamic = 'force-dynamic';

export default async function LikedPage({ searchParams }: { searchParams: Promise<{ artist?: string | string[] }> }) {
  const sp = await searchParams;
  const artistSlug = Array.isArray(sp.artist) ? sp.artist[0] : sp.artist;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login?next=%2Flibrary%2Fliked');

  const [res, labels] = await Promise.all([supabase.rpc('my_liked_songs'), loadLabels(supabase)]);
  if (res.error) console.error('liked: load failed', res.error);
  const all = (res.data ?? []) as Song[];

  // "You liked 2 songs · Artist" on an artist's page opens this list for that artist only.
  const scoped = artistSlug ? all.filter((s) => s.artist_slug === artistSlug) : all;
  const scope = artistSlug && scoped.length > 0 ? { label: scoped[0].artist_name, clearHref: '/library/liked' } : null;
  const songs = scope ? scoped : all;

  // A liked song has no slot of its own: the song's id stands in for it.
  const rows: PlaylistRow[] = songs.map((s, i) => ({ item_id: s.id, position: i, key_override: null, song: s }));

  return (
    <>
      {res.error ? <p className="error" role="alert">Your liked songs could not be loaded. Please refresh in a moment.</p> : null}
      <ListView
        key={scope ? scope.label : 'all'}
        kind="liked"
        id={null}
        title="Liked songs"
        serviceDate={null}
        rows={rows}
        languageNames={Object.fromEntries(labels.languages.map((l) => [l.code, l.name]))}
        genreLabels={Object.fromEntries(labels.tags.filter((t) => t.kind === 'genre').map((t) => [t.code, t.label]))}
        scope={scope}
      />
    </>
  );
}
