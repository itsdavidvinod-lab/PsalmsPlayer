import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { LyricsVersion, Song, StageItem } from '@/lib/types';
import StageView from '../../../StageView';

export const metadata: Metadata = { title: 'Stage mode' };
export const dynamic = 'force-dynamic';

export default async function StageSongPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent('/stage/song/' + slug)}`);

  // Same rule as the song page: a hidden or unknown song is simply "not found".
  const { data: row } = await supabase.from('v_songs').select('*').eq('slug', slug).maybeSingle();
  if (!row) notFound();
  const song = row as Song;

  const lyricsRes = await supabase.rpc('get_lyrics', { p_song: song.id });
  if (lyricsRes.error) console.error('stage: get_lyrics failed', lyricsRes.error);

  const items: StageItem[] = [
    {
      id: song.id,
      songId: song.id,
      available: true,
      title: song.title,
      artist: song.artist_name,
      baseKey: song.musical_key,
      keyOverride: null,
      lyrics: (lyricsRes.data ?? []) as LyricsVersion[],
    },
  ];

  return <StageView title={song.title} items={items} backHref={`/song/${song.slug}`} />;
}
