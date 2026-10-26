import type { AlbumOption, ArtistOption, Option } from '@/lib/admin-types';
import type { createClient } from '@/lib/supabase/server';

type Db = Awaited<ReturnType<typeof createClient>>;

type TagRow = { kind: string; code: string; label: string };

/** Everything the song form offers as choices: artists, albums, languages and the controlled lists. */
export async function loadSongChoices(supabase: Db): Promise<{
  artists: ArtistOption[];
  albums: AlbumOption[];
  languages: Option[];
  genres: Option[];
  occasions: Option[];
  moods: Option[];
  failed: boolean;
}> {
  const [artistRes, albumRes, langRes, tagRes] = await Promise.all([
    supabase.from('artists').select('id, name').order('name'),
    supabase.from('albums').select('id, artist_id, title').order('title'),
    supabase.from('languages').select('code, name, native_name').order('name'),
    supabase.from('tags').select('kind, code, label').order('label'),
  ]);
  const tags = (tagRes.data ?? []) as TagRow[];
  const tagOptions = (kind: string): Option[] => tags.filter((t) => t.kind === kind).map((t) => ({ value: t.code, label: t.label }));
  return {
    artists: (artistRes.data ?? []) as ArtistOption[],
    albums: (albumRes.data ?? []) as AlbumOption[],
    languages: (langRes.data ?? []).map((l: { code: string; name: string; native_name: string | null }) => ({
      value: l.code,
      label: l.native_name && l.native_name !== l.name ? `${l.name} · ${l.native_name}` : l.name,
    })),
    genres: tagOptions('genre'),
    occasions: tagOptions('occasion'),
    moods: tagOptions('mood'),
    failed: Boolean(artistRes.error || albumRes.error || langRes.error || tagRes.error),
  };
}
