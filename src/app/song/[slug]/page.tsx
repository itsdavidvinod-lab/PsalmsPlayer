import { notFound, redirect } from 'next/navigation';
import Header from '@/components/Header';
import { createClient } from '@/lib/supabase/server';
import type { LyricsVersion, Song } from '@/lib/types';
import SongView from './SongView';

export const dynamic = 'force-dynamic';

export default async function SongPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent('/song/' + slug)}`);

  // v_songs only contains live songs. A hidden, expired or unknown song is simply "not found": the reason is never shown.
  const { data: songRow } = await supabase.from('v_songs').select('*').eq('slug', slug).maybeSingle();
  if (!songRow) notFound();
  const song = songRow as Song;

  const [lyricsRes, likeRes] = await Promise.all([
    supabase.rpc('get_lyrics', { p_song: song.id }),
    supabase.from('song_likes').select('song_id').eq('song_id', song.id).eq('user_id', user.id).maybeSingle(),
  ]);
  if (lyricsRes.error) console.error('song: get_lyrics failed', lyricsRes.error);
  const lyrics = (lyricsRes.data ?? []) as LyricsVersion[];

  return (
    <div className="wrap">
      <Header />
      <SongView song={song} lyrics={lyrics} initiallyLiked={Boolean(likeRes.data)} userId={user.id} lyricsFailed={Boolean(lyricsRes.error)} />
    </div>
  );
}
