import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { LyricsVersion, StageItem } from '@/lib/types';
import StageView from '../../../StageView';

export const metadata: Metadata = { title: 'Stage mode' };
export const dynamic = 'force-dynamic';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

type ItemRow = {
  item_id: string; position: number; key_override: string | null; available: boolean;
  song_id: string | null; slug: string | null; title: string | null; artist_name: string | null; musical_key: string | null;
};

export default async function StageSetlistPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent('/stage/setlist/' + id)}`);

  const { data: list } = await supabase.from('playlists').select('id, name').eq('id', id).maybeSingle();
  if (!list) notFound();

  const itemsRes = await supabase.rpc('my_playlist_items', { p_playlist: id });
  if (itemsRes.error) console.error('stage: items failed', itemsRes.error);
  const rows = (itemsRes.data ?? []) as ItemRow[];
  if (rows.length === 0) redirect(`/library/${id}`);

  // Fetch each song's lyrics once, even when the song appears twice in the list.
  const songIds = [...new Set(rows.flatMap((r) => (r.available && r.song_id ? [r.song_id] : [])))];
  const fetched = await Promise.all(
    songIds.map(async (songId) => {
      const res = await supabase.rpc('get_lyrics', { p_song: songId });
      if (res.error) console.error('stage: get_lyrics failed', res.error);
      return [songId, (res.data ?? []) as LyricsVersion[]] as const;
    }),
  );
  const lyricsBySong = new Map(fetched);

  const items: StageItem[] = rows.map((r) => ({
    id: r.item_id,
    songId: r.available ? r.song_id : null,
    available: r.available,
    title: r.title,
    artist: r.artist_name,
    baseKey: r.musical_key,
    keyOverride: r.key_override,
    lyrics: r.available && r.song_id ? lyricsBySong.get(r.song_id) ?? [] : [],
  }));

  return <StageView title={list.name as string} items={items} backHref={`/library/${id}`} />;
}
