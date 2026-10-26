-- seed.sql
-- Development data. Runs on `supabase db reset` and in the test harness. Never run this on production.
-- All lyrics here are placeholder text, not real songs.

-- ---------------------------------------------------------------- reference data
insert into public.languages (code, name, native_name) values
  ('ta', 'Tamil', 'தமிழ்'), ('en', 'English', 'English'), ('hi', 'Hindi', 'हिन्दी'),
  ('te', 'Telugu', 'తెలుగు'), ('ml', 'Malayalam', 'മലയാളം'), ('kn', 'Kannada', 'ಕನ್ನಡ'),
  ('mr', 'Marathi', 'मराठी'), ('bn', 'Bengali', 'বাংলা'), ('ne', 'Nepali', 'नेपाली');

insert into public.regions (code, name, country_code) values
  ('IN', 'India', 'IN'), ('IN-TN', 'Tamil Nadu', 'IN'), ('IN-KL', 'Kerala', 'IN'),
  ('IN-AP', 'Andhra Pradesh', 'IN'), ('IN-KA', 'Karnataka', 'IN'), ('IN-MH', 'Maharashtra', 'IN'),
  ('LK', 'Sri Lanka', 'LK'), ('SG', 'Singapore', 'SG'), ('MY', 'Malaysia', 'MY'),
  ('AE', 'United Arab Emirates', 'AE'), ('GB', 'United Kingdom', 'GB'), ('US', 'United States', 'US'),
  ('CA', 'Canada', 'CA'), ('AU', 'Australia', 'AU');

insert into public.tags (kind, code, label) values
  ('genre', 'worship', 'Worship'), ('genre', 'praise', 'Praise'), ('genre', 'hymns', 'Hymns'),
  ('genre', 'gospel', 'Gospel'), ('genre', 'choir', 'Choir'), ('genre', 'kids', 'Kids'),
  ('occasion', 'sunday-service', 'Sunday service'), ('occasion', 'christmas', 'Christmas'),
  ('occasion', 'easter', 'Easter'), ('occasion', 'wedding', 'Wedding'), ('occasion', 'funeral', 'Funeral'),
  ('occasion', 'youth-camp', 'Youth camp'), ('occasion', 'new-year', 'New Year'),
  ('mood', 'joyful', 'Joyful'), ('mood', 'reflective', 'Reflective'),
  ('mood', 'peaceful', 'Peaceful'), ('mood', 'triumphant', 'Triumphant');

-- ---------------------------------------------------------------- artists and agreements
-- Fixed ids so tests can refer to them.
insert into public.artists (id, slug, name, bio, photo_url, language_codes, region_code, genres, is_published) values
  ('a0000000-0000-0000-0000-000000000001', 'grace-worship', 'Grace Worship Team', 'Placeholder bio.', 'https://example.org/grace.jpg', '{ta,en}', 'IN-TN', '{worship,praise}', true),
  ('a0000000-0000-0000-0000-000000000002', 'shalom-choir',  'Shalom Choir',       'Placeholder bio.', 'https://example.org/shalom.jpg', '{ml,en}', 'IN-KL', '{choir,hymns}',   true),
  ('a0000000-0000-0000-0000-000000000003', 'draft-artist',  'Draft Artist',       null,               null,                             '{hi}',    'IN-MH', '{gospel}',        false);

-- A placeholder admin that "verified" the agreements below. It has no password and cannot log in.
-- Make your own admin by signing up and running:  update public.profiles set role = 'admin' where id = '<your user id>';
insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000000aa', 'seed-admin@example.invalid')
  on conflict (id) do nothing;
update public.profiles set role = 'admin', display_name = 'Seed admin' where id = '00000000-0000-0000-0000-0000000000aa';

insert into public.agreements (id, artist_id, status, verified_at, verified_by, starts_on, expires_on, document_ref,
                               allow_lyrics, allow_chords, allow_translations, allow_video_embed, territories, revocation_email)
values
  -- Grace Worship Team: valid, everything allowed
  ('b0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'verified', now(), '00000000-0000-0000-0000-0000000000aa',
   public.app_today() - 30, public.app_today() + 200, 'mailbox:msg-0001', true, true, true, true, '{IN,LK}', 'rights@example.org'),
  -- Shalom Choir: expired yesterday, so the artist shows as Unavailable
  ('b0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'verified', now(), '00000000-0000-0000-0000-0000000000aa',
   public.app_today() - 400, public.app_today() - 1, 'mailbox:msg-0002', true, true, false, true, '{IN}', 'rights@example.org');

-- ---------------------------------------------------------------- albums and songs
insert into public.albums (id, artist_id, slug, title, kind, release_year, is_published) values
  ('c0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'morning-light', 'Morning Light', 'album', 2025, true),
  ('c0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000002', 'evening-hymns',  'Evening Hymns', 'album', 2024, true);

insert into public.songs (id, artist_id, album_id, slug, title, language_code, musical_key, tempo_bpm, duration_s, track_no,
                          genres, occasions, moods, youtube_id, youtube_status, is_published, published_at) values
  -- S1 live: all writers consented
  ('d0000000-0000-0000-0000-000000000001', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'placeholder-song-one', 'Placeholder Song One', 'ta', 'G', 72, 252, 1, '{worship}', '{sunday-service}', '{peaceful}',
   'dQw4w9WgXcQ', 'ok', true, now() - interval '20 days'),
  -- S2 hidden: one writer has not consented yet
  ('d0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'placeholder-song-two', 'Placeholder Song Two', 'ta', 'D', 80, 228, 2, '{praise}', '{youth-camp}', '{joyful}',
   null, 'unchecked', true, now() - interval '10 days'),
  -- S3 hidden: a writer consent ran out yesterday
  ('d0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000001',
   'placeholder-song-three', 'Placeholder Song Three', 'en', 'A', 90, 270, 3, '{worship}', '{easter}', '{reflective}',
   null, 'unchecked', true, now() - interval '9 days'),
  -- S4 live single, YouTube link failed its check so no video is shown
  ('d0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000001', null,
   'placeholder-single', 'Placeholder Single', 'en', 'E', 100, 190, null, '{praise}', '{christmas}', '{joyful}',
   'abcdefghijk', 'channel_mismatch', true, now() - interval '3 days'),
  -- S5 hidden: artist agreement expired
  ('d0000000-0000-0000-0000-000000000005', 'a0000000-0000-0000-0000-000000000002', 'c0000000-0000-0000-0000-000000000002',
   'placeholder-hymn', 'Placeholder Hymn', 'ml', 'C', 60, 300, 1, '{hymns}', '{sunday-service}', '{peaceful}',
   null, 'unchecked', true, now() - interval '30 days'),
  -- S6 hidden: taken down by admin
  ('d0000000-0000-0000-0000-000000000006', 'a0000000-0000-0000-0000-000000000001', null,
   'placeholder-takedown', 'Placeholder Takedown', 'en', 'F', 70, 200, null, '{worship}', '{}', '{}',
   null, 'unchecked', true, now() - interval '5 days');
update public.songs set hidden_by_admin = true, hidden_note = 'takedown notice' where id = 'd0000000-0000-0000-0000-000000000006';

insert into public.song_credits (song_id, person_name, role, consent_status, consent_ref, consent_expires_on) values
  ('d0000000-0000-0000-0000-000000000001', 'Writer One',   'writer', 'granted', 'mailbox:msg-0101', public.app_today() + 300),
  ('d0000000-0000-0000-0000-000000000001', 'Owner One',    'owner',  'granted', 'mailbox:msg-0102', null),
  ('d0000000-0000-0000-0000-000000000002', 'Writer Two',   'writer', 'granted', 'mailbox:msg-0103', null),
  ('d0000000-0000-0000-0000-000000000002', 'Writer Three', 'writer', 'pending', null, null),
  ('d0000000-0000-0000-0000-000000000003', 'Writer Four',  'writer', 'granted', 'mailbox:msg-0104', public.app_today() - 1),
  ('d0000000-0000-0000-0000-000000000004', 'Writer Five',  'writer', 'granted', 'mailbox:msg-0105', null),
  ('d0000000-0000-0000-0000-000000000005', 'Writer Six',   'writer', 'granted', 'mailbox:msg-0106', null),
  ('d0000000-0000-0000-0000-000000000006', 'Writer Seven', 'writer', 'granted', 'mailbox:msg-0107', null);

insert into public.lyrics (song_id, version, language_code, body) values
  ('d0000000-0000-0000-0000-000000000001', 'original', 'ta',
   E'{title: Placeholder Song One}\n{comment: Verse 1}\n[G]Placeholder line one of the [C]verse\n[D]Placeholder line two of the [G]verse\n{comment: Chorus}\n[Em]Placeholder chorus [C]line\n[G/B]Placeholder chorus [D]line'),
  ('d0000000-0000-0000-0000-000000000001', 'romanized', 'en',
   E'Placeholder romanized line one\nPlaceholder romanized line two'),
  ('d0000000-0000-0000-0000-000000000001', 'meaning', 'en',
   E'Placeholder meaning line one\nPlaceholder meaning line two'),
  ('d0000000-0000-0000-0000-000000000002', 'original', 'ta', E'[D]Hidden placeholder line one\n[A]Hidden placeholder line two'),
  ('d0000000-0000-0000-0000-000000000004', 'original', 'en', E'[E]Single placeholder line one\n[A]Single placeholder line two');

-- ---------------------------------------------------------------- requests and posters
insert into public.requests (id, kind, channel, contact, contact_verified, status, amount_paise, paid_at) values
  ('e0000000-0000-0000-0000-000000000001', 'promotion', 'whatsapp', '+910000000001', true,  'live',        9900, now()),
  ('e0000000-0000-0000-0000-000000000002', 'promotion', 'email',    'a@example.org', true,  'live',        4900, now()),
  ('e0000000-0000-0000-0000-000000000003', 'promotion', 'whatsapp', '+910000000003', true,  'completed',  19900, now() - interval '40 days'),
  ('e0000000-0000-0000-0000-000000000004', 'promotion', 'whatsapp', '+910000000004', false, 'in_discussion', null, null);

insert into public.posters (id, request_id, kind, title, image_url, target_language_codes, target_region_codes, match_mode,
                            event_date, starts_at, ends_at, status) values
  -- P1: Tamil AND Tamil Nadu, running
  ('f0000000-0000-0000-0000-000000000001', 'e0000000-0000-0000-0000-000000000001', 'event', 'Poster both', 'https://example.org/p1.jpg',
   '{ta}', '{IN-TN}', 'both', public.app_today() + 20, now() - interval '1 day', now() + interval '10 days', 'approved'),
  -- P2: everyone, running
  ('f0000000-0000-0000-0000-000000000002', 'e0000000-0000-0000-0000-000000000002', 'release', 'Poster everyone', 'https://example.org/p2.jpg',
   '{}', '{}', 'everyone', null, now() - interval '2 days', now() + interval '5 days', 'approved'),
  -- P3: paid period ended yesterday
  ('f0000000-0000-0000-0000-000000000003', 'e0000000-0000-0000-0000-000000000003', 'notice', 'Poster ended', 'https://example.org/p3.jpg',
   '{}', '{}', 'everyone', null, now() - interval '31 days', now() - interval '1 day', 'approved'),
  -- P4: paid period still open but the event date passed yesterday, so it ends with the event
  ('f0000000-0000-0000-0000-000000000004', 'e0000000-0000-0000-0000-000000000001', 'event', 'Poster event passed', 'https://example.org/p4.jpg',
   '{}', '{}', 'everyone', public.app_today() - 1, now() - interval '5 days', now() + interval '20 days', 'approved'),
  -- P5: Hindi OR Maharashtra
  ('f0000000-0000-0000-0000-000000000005', 'e0000000-0000-0000-0000-000000000002', 'event', 'Poster either', 'https://example.org/p5.jpg',
   '{hi}', '{IN-MH}', 'either', null, now() - interval '1 day', now() + interval '3 days', 'approved'),
  -- P6: starts tomorrow
  ('f0000000-0000-0000-0000-000000000006', 'e0000000-0000-0000-0000-000000000001', 'event', 'Poster future', 'https://example.org/p6.jpg',
   '{}', '{}', 'everyone', null, now() + interval '1 day', now() + interval '8 days', 'approved'),
  -- P7: refunded
  ('f0000000-0000-0000-0000-000000000007', 'e0000000-0000-0000-0000-000000000001', 'event', 'Poster refunded', 'https://example.org/p7.jpg',
   '{}', '{}', 'everyone', null, now() - interval '1 day', now() + interval '8 days', 'refunded');
