// Shapes returned by the public API in supabase/migrations/0004_public_api.sql.
// Written by hand for now. Replace with generated types once the Supabase project exists.

export type Song = {
  id: string;
  slug: string;
  title: string;
  language_code: string;
  musical_key: string | null;
  tempo_bpm: number | null;
  duration_s: number | null;
  track_no: number | null;
  genres: string[];
  occasions: string[];
  moods: string[];
  published_at: string | null;
  artist_id: string;
  artist_slug: string;
  artist_name: string;
  album_id: string | null;
  album_slug: string | null;
  album_title: string | null;
  youtube_id: string | null;
  like_count: number;
  /** True when an audio file is hosted for the song. The file's path itself is never sent to the browser. */
  has_audio: boolean;
};

export type Poster = {
  id: string;
  kind: 'event' | 'release' | 'notice';
  title: string;
  image_url: string;
  youtube_id: string | null;
  event_date: string | null;
  match_rank: number;
};

export type LyricsVersion = {
  version: 'original' | 'romanized' | 'meaning';
  language_code: string;
  body: string;
  has_chords: boolean;
};

export type Profile = {
  display_name: string | null;
  role: 'user' | 'admin';
  language_codes: string[];
  region_code: string | null;
};

export type Language = { code: string; name: string; native_name: string | null };
export type Region = { code: string; name: string; country_code: string };

export type Artist = {
  id: string;
  slug: string;
  name: string;
  available: boolean;
  bio: string | null;
  photo_url: string | null;
  language_codes: string[];
  region_code: string | null;
  genres: string[];
};

export type Album = {
  id: string;
  slug: string;
  title: string;
  kind: string;
  release_year: number | null;
  cover_url: string | null;
  artist_id: string;
  artist_slug: string;
  artist_name: string;
};

export type Playlist = {
  id: string;
  name: string;
  kind: 'playlist' | 'setlist';
  service_date: string | null;
};

/** One slot of a playlist or setlist. `song` is null when the song is not available right now: the slot keeps its place. */
export type PlaylistRow = {
  item_id: string;
  position: number;
  key_override: string | null;
  song: Song | null;
};

/** One screen of Stage mode: a song with its lyrics, or a slot whose song is not available right now. */
export type StageItem = {
  id: string;
  songId: string | null;
  available: boolean;
  title: string | null;
  artist: string | null;
  baseKey: string | null;
  keyOverride: string | null;
  lyrics: LyricsVersion[];
};
