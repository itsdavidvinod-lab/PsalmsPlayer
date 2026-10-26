import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Playlist, PlaylistRow, Song } from '@/lib/types';
import PlaylistView from './PlaylistView';

export const metadata: Metadata = { title: 'List' };
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ItemRow = { item_id: string; position: number; key_override: string | null; available: boolean; song_id: string | null };

export default async function PlaylistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent('/library/' + id)}`);

  // Only your own lists are visible, so somebody else's list is simply "not found".
  const { data: listRow } = await supabase.from('playlists').select('id, name, kind, service_date').eq('id', id).maybeSingle();
  if (!listRow) notFound();
  const playlist = listRow as Playlist;

  const itemsRes = await supabase.rpc('my_playlist_items', { p_playlist: id });
  if (itemsRes.error) console.error('library: items failed', itemsRes.error);
  const items = (itemsRes.data ?? []) as ItemRow[];

  const songIds = items.flatMap((i) => (i.available && i.song_id ? [i.song_id] : []));
  const songsRes = songIds.length > 0 ? await supabase.from('v_songs').select('*').in('id', songIds) : { data: [] as Song[], error: null };
  if (songsRes.error) console.error('library: songs failed', songsRes.error);
  const byId = new Map(((songsRes.data ?? []) as Song[]).map((s) => [s.id, s]));

  // A slot whose song is not available keeps its place and shows no title.
  const rows: PlaylistRow[] = items.map((i) => ({
    item_id: i.item_id,
    position: i.position,
    key_override: i.key_override,
    song: i.available && i.song_id ? byId.get(i.song_id) ?? null : null,
  }));

  return (
    <div>
      {itemsRes.error ? <p className="error" role="alert">This list could not be loaded. Please refresh in a moment.</p> : null}
      <PlaylistView playlist={playlist} rows={rows} />
    </div>
  );
}
