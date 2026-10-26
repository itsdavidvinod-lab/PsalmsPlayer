// Shapes the admin pages read. Written by hand, like types.ts.

export type Option = { value: string; label: string };

export type AdminArtist = {
  id: string;
  slug: string;
  name: string;
  bio: string | null;
  photo_url: string | null;
  language_codes: string[];
  region_code: string | null;
  genres: string[];
  is_published: boolean;
};

export type AdminAlbum = {
  id: string;
  slug: string;
  title: string;
  kind: 'album' | 'ep' | 'single';
  release_year: number | null;
  cover_url: string | null;
  is_published: boolean;
};

/** One row of v_admin_artists. */
export type AdminArtistSummary = {
  id: string;
  slug: string;
  name: string;
  is_published: boolean;
  available: boolean;
  agreement_expires_on: string | null;
  agreement_days_left: number | null;
  song_count: number;
  live_song_count: number;
};

/** One row of v_admin_songs. */
export type AdminSongSummary = {
  id: string;
  slug: string;
  title: string;
  artist_id: string;
  artist_name: string;
  album_id: string | null;
  is_published: boolean;
  hidden_by_admin: boolean;
  visibility: string;
};

/** One row of v_expiry_watch. */
export type ExpiryRow = {
  kind: 'agreement' | 'consent';
  artist_id: string;
  artist_name: string;
  song_id: string | null;
  song_title: string | null;
  person_name: string | null;
  expires_on: string;
  days_left: number;
};
