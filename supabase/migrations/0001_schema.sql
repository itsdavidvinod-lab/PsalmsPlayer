-- 0001_schema.sql
-- Tables only. Rules, security and public API live in 0002..0004.
-- Dates that mean "end of that day" (agreement and consent expiry) are read in India time, see app_today().

-- ---------------------------------------------------------------- reference data
create table public.languages (
  code        text primary key,
  name        text not null,
  native_name text
);

create table public.regions (
  code         text primary key,            -- 'IN' (country) or 'IN-TN' (state)
  name         text not null,
  country_code text not null
);

-- Controlled lists. No free-text genres, occasions or moods.
create table public.tags (
  kind  text not null check (kind in ('genre', 'occasion', 'mood')),
  code  text not null,
  label text not null,
  primary key (kind, code)
);

-- ---------------------------------------------------------------- people
create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  display_name   text,
  role           text not null default 'user' check (role in ('user', 'admin')),
  language_codes text[] not null default '{}',
  region_code    text references public.regions (code),
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- catalogue
create table public.artists (
  id             uuid primary key default gen_random_uuid(),
  slug           text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name           text not null,
  bio            text,
  photo_url      text,
  language_codes text[] not null default '{}',
  region_code    text references public.regions (code),
  genres         text[] not null default '{}',
  is_published   boolean not null default false,
  created_at     timestamptz not null default now()
);

-- One row per signed agreement. A renewal is a new row.
-- "verified" means an admin matched a signed document that arrived from the official mailbox.
create table public.agreements (
  id                   uuid primary key default gen_random_uuid(),
  artist_id            uuid not null references public.artists (id) on delete cascade,
  status               text not null default 'sent' check (status in ('sent', 'signed', 'verified', 'revoked')),
  sent_at              timestamptz,
  signed_at            timestamptz,
  verified_at          timestamptz,
  verified_by          uuid references public.profiles (id),
  starts_on            date,
  expires_on           date,
  document_ref         text,                -- id of the signed document / message in the official mailbox
  allow_lyrics         boolean not null default false,
  allow_chords         boolean not null default false,
  allow_translations   boolean not null default false,
  allow_video_embed    boolean not null default false,
  allow_audio_hosting  boolean not null default false,
  allow_photo_bio      boolean not null default false,
  territories          text[] not null default '{}',
  revocation_email     text,
  created_at           timestamptz not null default now(),
  constraint agreement_dates_ordered check (starts_on is null or expires_on is null or expires_on >= starts_on),
  -- An agreement only counts once it is tied to a signed document from the official mailbox and has a term.
  constraint agreement_verified_needs_proof check (
    status <> 'verified'
    or (document_ref is not null and verified_by is not null and verified_at is not null
        and starts_on is not null and expires_on is not null)
  )
);

create table public.albums (
  id           uuid primary key default gen_random_uuid(),
  artist_id    uuid not null references public.artists (id) on delete cascade,
  slug         text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title        text not null,
  kind         text not null default 'album' check (kind in ('album', 'ep', 'single')),
  release_year int check (release_year between 1900 and 2100),
  cover_url    text,
  is_published boolean not null default false,
  created_at   timestamptz not null default now()
);

create table public.songs (
  id                 uuid primary key default gen_random_uuid(),
  artist_id          uuid not null references public.artists (id) on delete cascade,
  album_id           uuid references public.albums (id) on delete set null,
  slug               text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title              text not null,
  language_code      text not null references public.languages (code),
  musical_key        text,
  tempo_bpm          int check (tempo_bpm is null or tempo_bpm between 30 and 300),
  duration_s         int check (duration_s is null or duration_s > 0),
  track_no           int,
  genres             text[] not null default '{}',
  occasions          text[] not null default '{}',
  moods              text[] not null default '{}',
  youtube_id         text check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  youtube_status     text not null default 'unchecked'
                       check (youtube_status in ('unchecked', 'ok', 'channel_mismatch', 'not_embeddable', 'missing')),
  youtube_checked_at timestamptz,
  is_published       boolean not null default false,
  hidden_by_admin    boolean not null default false,   -- takedown switch, overrides everything
  hidden_note        text,
  published_at       timestamptz,
  created_at         timestamptz not null default now()
);

-- Writers and owners must consent before a song can be live.
create table public.song_credits (
  id                 uuid primary key default gen_random_uuid(),
  song_id            uuid not null references public.songs (id) on delete cascade,
  person_name        text not null,
  role               text not null check (role in ('writer', 'owner', 'performer', 'translator')),
  contact            text,
  consent_status     text not null default 'pending' check (consent_status in ('pending', 'granted', 'revoked')),
  consent_ref        text,
  consent_expires_on date,
  created_at         timestamptz not null default now()
);

-- Lyrics in ChordPro format: chords in [brackets], e.g. "[G]Line of [C]lyrics".
create table public.lyrics (
  id            uuid primary key default gen_random_uuid(),
  song_id       uuid not null references public.songs (id) on delete cascade,
  version       text not null check (version in ('original', 'romanized', 'meaning')),
  language_code text references public.languages (code),
  body          text not null,
  updated_at    timestamptz not null default now(),
  unique (song_id, version)
);

-- ---------------------------------------------------------------- requests, posters
-- Every promotion or song request that arrives by WhatsApp or email. Admin only. Amounts live here and nowhere else.
create table public.requests (
  id                uuid primary key default gen_random_uuid(),
  kind              text not null check (kind in ('promotion', 'songs')),
  channel           text not null check (channel in ('whatsapp', 'email')),
  contact           text not null,
  contact_verified  boolean not null default false,
  status            text not null default 'in_discussion'
                      check (status in ('in_discussion', 'agreed', 'awaiting_payment', 'paid', 'live', 'completed', 'refunded', 'cancelled')),
  amount_paise      bigint check (amount_paise is null or amount_paise >= 0),
  paid_at           timestamptz,
  refund_paise      bigint check (refund_paise is null or refund_paise >= 0),
  refund_reason     text,
  notes             text,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

-- Users never see starts_at / ends_at. They only receive what home_posters() returns.
create table public.posters (
  id                    uuid primary key default gen_random_uuid(),
  request_id            uuid references public.requests (id),
  kind                  text not null check (kind in ('event', 'release', 'notice')),
  title                 text not null,
  image_url             text not null,
  youtube_id            text check (youtube_id is null or youtube_id ~ '^[A-Za-z0-9_-]{11}$'),
  target_language_codes text[] not null default '{}',
  target_region_codes   text[] not null default '{}',
  match_mode            text not null default 'everyone' check (match_mode in ('both', 'either', 'everyone')),
  event_date            date,
  starts_at             timestamptz,
  ends_at               timestamptz,
  status                text not null default 'draft' check (status in ('draft', 'approved', 'paused', 'refunded')),
  created_at            timestamptz not null default now(),
  constraint poster_window_ordered check (starts_at is null or ends_at is null or ends_at > starts_at),
  constraint poster_approved_needs_window check (status <> 'approved' or (starts_at is not null and ends_at is not null)),
  constraint poster_targets_match_mode check (
    match_mode = 'everyone'
    or (match_mode = 'both'   and cardinality(target_language_codes) > 0 and cardinality(target_region_codes) > 0)
    or (match_mode = 'either' and (cardinality(target_language_codes) > 0 or cardinality(target_region_codes) > 0))
  )
);

-- ---------------------------------------------------------------- user data
create table public.song_likes (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  song_id    uuid not null references public.songs (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, song_id)
);

-- A playlist is for listening. A setlist is the same thing with a service date and per-item key.
create table public.playlists (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  name         text not null check (char_length(name) between 1 and 80),
  kind         text not null default 'playlist' check (kind in ('playlist', 'setlist')),
  service_date date,
  created_at   timestamptz not null default now()
);

create table public.playlist_items (
  id           uuid primary key default gen_random_uuid(),
  playlist_id  uuid not null references public.playlists (id) on delete cascade,
  song_id      uuid not null references public.songs (id) on delete cascade,
  position     int not null,
  key_override text,
  created_at   timestamptz not null default now()
);

-- Written only through record_play(). Drives trending and monthly listeners.
create table public.play_events (
  id         bigint generated always as identity primary key,
  user_id    uuid not null references public.profiles (id) on delete cascade,
  song_id    uuid not null references public.songs (id) on delete cascade,
  kind       text not null check (kind in ('play', 'lyrics_open')),
  created_at timestamptz not null default now()
);

-- Written only by triggers. Nobody can edit or delete it through the API.
create table public.audit_log (
  id        bigint generated always as identity primary key,
  at        timestamptz not null default now(),
  actor     uuid,
  action    text not null,
  entity    text not null,
  entity_id uuid,
  old_row   jsonb,
  new_row   jsonb
);

-- ---------------------------------------------------------------- indexes
create index songs_artist_idx          on public.songs (artist_id);
create index songs_album_idx           on public.songs (album_id);
create index song_credits_song_idx     on public.song_credits (song_id);
create index agreements_artist_idx     on public.agreements (artist_id, status, expires_on);
create index play_events_song_time_idx on public.play_events (song_id, created_at);
create index play_events_user_idx      on public.play_events (user_id, song_id, kind, created_at);
create index posters_window_idx        on public.posters (status, starts_at, ends_at);
create index playlist_items_list_idx   on public.playlist_items (playlist_id, position);
create index audit_log_entity_idx      on public.audit_log (entity, entity_id, at);
