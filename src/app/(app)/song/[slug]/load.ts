import { notFound, redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { LyricsVersion, Song } from '@/lib/types';

export type SongScreenData = {
  song: Song;
  /** The songs that play after this one when it is started from its page. */
  queue: Song[];
  lyrics: LyricsVersion[];
  lyricsFailed: boolean;
  languageName: string;
  userId: string;
};

/** Everything the song screens need. A hidden, expired or unknown song is simply "not found": the reason is never shown. */
export async function loadSongScreen(slug: string, here: string): Promise<SongScreenData> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(here)}`);

  // v_songs only contains live songs.
  const { data: songRow } = await supabase.from('v_songs').select('*').eq('slug', slug).maybeSingle();
  if (!songRow) notFound();
  const song = songRow as Song;

  const [lyricsRes, albumRes, languageRes] = await Promise.all([
    supabase.rpc('get_lyrics', { p_song: song.id }),
    // Playing from a song page continues down its album; a single has a queue of one.
    song.album_id ? supabase.from('v_songs').select('*').eq('album_id', song.album_id).order('track_no', { ascending: true }) : Promise.resolve({ data: null, error: null }),
    supabase.from('languages').select('name').eq('code', song.language_code).maybeSingle(),
  ]);
  if (lyricsRes.error) console.error('song: get_lyrics failed', lyricsRes.error);
  const albumSongs = (albumRes.data ?? []) as Song[];

  return {
    song,
    queue: albumSongs.some((s) => s.id === song.id) ? albumSongs : [song],
    lyrics: (lyricsRes.data ?? []) as LyricsVersion[],
    lyricsFailed: Boolean(lyricsRes.error),
    languageName: (languageRes.data as { name: string } | null)?.name ?? song.language_code.toUpperCase(),
    userId: user.id,
  };
}
