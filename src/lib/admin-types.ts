// Shapes the admin pages read. Written by hand, like types.ts.
import type { AgreementStatus } from './agreement-form.ts';

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

export type YoutubeStatus = 'unchecked' | 'ok' | 'channel_mismatch' | 'not_embeddable' | 'missing';

export type AdminSong = {
  id: string;
  artist_id: string;
  album_id: string | null;
  slug: string;
  title: string;
  language_code: string;
  musical_key: string | null;
  tempo_bpm: number | null;
  track_no: number | null;
  genres: string[];
  occasions: string[];
  moods: string[];
  youtube_id: string | null;
  youtube_status: YoutubeStatus;
  youtube_checked_at: string | null;
  is_published: boolean;
  hidden_by_admin: boolean;
  hidden_note: string | null;
  published_at: string | null;
};

export type CreditRole = 'writer' | 'owner' | 'performer' | 'translator';
export type ConsentStatus = 'pending' | 'granted' | 'revoked';

export type AdminCredit = {
  id: string;
  song_id: string;
  person_name: string;
  role: CreditRole;
  contact: string | null;
  consent_status: ConsentStatus;
  consent_ref: string | null;
  consent_expires_on: string | null;
};

export type LyricsVersionName = 'original' | 'romanized' | 'meaning';

export type AdminLyrics = {
  id: string;
  version: LyricsVersionName;
  language_code: string | null;
  body: string;
};

export type ArtistOption = { id: string; name: string };
export type AlbumOption = { id: string; artist_id: string; title: string };

/** The hosted recording of a song (columns of songs). All null when none is uploaded. */
export type AdminAudio = {
  audio_path: string | null;
  audio_mime: string | null;
  audio_bytes: number | null;
  duration_s: number | null;
};

/** One row of agreements, as the admin form edits it. */
export type AdminAgreement = {
  id: string;
  artist_id: string;
  status: AgreementStatus;
  sent_at: string | null;
  signed_at: string | null;
  verified_at: string | null;
  verified_by: string | null;
  starts_on: string | null;
  expires_on: string | null;
  document_ref: string | null;
  allow_lyrics: boolean;
  allow_chords: boolean;
  allow_translations: boolean;
  allow_video_embed: boolean;
  allow_audio_hosting: boolean;
  allow_photo_bio: boolean;
  territories: string[];
  revocation_email: string | null;
  created_at: string;
};

/** The parts of v_admin_artists the artist page shows in its status line. */
export type AdminArtistStatus = { available: boolean; agreement_expires_on: string | null; agreement_days_left: number | null };
