-- security.test.sql
-- Each block is its own transaction and is rolled back. The first failed assertion stops the run.
-- Users: U1 and U2 are normal users, the seed admin is 00000000-...-aa.

create schema test_helpers;
grant usage on schema test_helpers to public;

-- Passes only if `stmt` fails with exactly `expected_state`.
create function test_helpers.expect_error(stmt text, expected_state text) returns void
language plpgsql as $$
begin
  begin
    execute stmt;
  exception when others then
    if sqlstate <> expected_state then
      raise exception 'expected SQLSTATE % but got % (%) for: %', expected_state, sqlstate, sqlerrm, stmt;
    end if;
    return;
  end;
  raise exception 'expected SQLSTATE % but the statement succeeded: %', expected_state, stmt;
end
$$;
grant execute on function test_helpers.expect_error(text, text) to public;

insert into auth.users (id, email, raw_user_meta_data) values
  ('11111111-1111-1111-1111-111111111111', 'u1@example.invalid', '{"full_name":"User One"}'),
  ('22222222-2222-2222-2222-222222222222', 'u2@example.invalid', '{}');

-- ============================================================ new users
begin;
do $$ begin
  assert (select role from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'user', 'new users start as role=user';
  assert (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'User One', 'display name comes from sign-up';
  assert (select display_name from public.profiles where id = '22222222-2222-2222-2222-222222222222') = 'u2', 'display name falls back to the email name';
  raise notice 'ok: profile created on sign-up';
end $$;
rollback;

-- ============================================================ anonymous visitors
begin;
set local role anon;
do $$ begin
  assert (select count(*) from public.v_artists) = 2, 'anon sees 2 published artists (one unavailable), not the draft';
  assert (select available from public.v_artists where slug = 'grace-worship') = true, 'grace is available';
  assert (select available from public.v_artists where slug = 'shalom-choir') = false, 'shalom (expired) is unavailable';
  assert (select bio is null and photo_url is null and genres = '{}' and language_codes = '{}' and region_code is null
            from public.v_artists where slug = 'shalom-choir'), 'unavailable artist shows name and placeholder only';
  assert (select bio is not null from public.v_artists where slug = 'grace-worship'), 'available artist keeps bio';
  assert (select count(*) from public.v_albums) = 1, 'only the available artist''s album is visible';
  assert (select count(*) from public.v_songs) = 2, 'only the 2 live songs are visible';
  assert (select count(*) from public.v_songs where slug in ('placeholder-song-two','placeholder-song-three','placeholder-hymn','placeholder-takedown')) = 0,
         'missing consent, expired consent, expired agreement and takedown are all hidden';
  assert (select youtube_id from public.v_songs where slug = 'placeholder-song-one') = 'dQw4w9WgXcQ', 'checked link is shown';
  assert (select youtube_id from public.v_songs where slug = 'placeholder-single') is null, 'link that failed its check is withheld';
  raise notice 'ok: anon sees only live, available catalogue';
end $$;
select test_helpers.expect_error($q$select * from public.songs$q$,        '42501');
select test_helpers.expect_error($q$select * from public.lyrics$q$,       '42501');
select test_helpers.expect_error($q$select * from public.agreements$q$,   '42501');
select test_helpers.expect_error($q$select * from public.requests$q$,     '42501');
select test_helpers.expect_error($q$select * from public.posters$q$,      '42501');
select test_helpers.expect_error($q$select * from public.audit_log$q$,    '42501');
select test_helpers.expect_error($q$select * from public.play_events$q$,  '42501');
select test_helpers.expect_error($q$select * from public.listen_sessions$q$, '42501');
select test_helpers.expect_error($q$select * from public.record_listen(null, 'd0000000-0000-0000-0000-000000000001', 10)$q$, '42501');
select test_helpers.expect_error($q$select * from public.profiles$q$,     '42501');
select test_helpers.expect_error($q$select * from public.song_credits$q$, '42501');
select test_helpers.expect_error($q$select * from public.get_lyrics('d0000000-0000-0000-0000-000000000001')$q$, '42501');
select test_helpers.expect_error($q$select public.record_play('d0000000-0000-0000-0000-000000000001')$q$, '42501');
select test_helpers.expect_error($q$select public.song_visibility('d0000000-0000-0000-0000-000000000002')$q$, '42501');
select test_helpers.expect_error($q$select * from public.v_admin_songs$q$, '42501');
select test_helpers.expect_error($q$update public.v_songs set title = 'x'$q$, '55000');  -- views are read-only
rollback;

-- ============================================================ lyrics need login and respect the agreement
begin;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.get_lyrics('d0000000-0000-0000-0000-000000000001')) = 3, 'live song returns original, romanized, meaning';
  assert (select has_chords from public.get_lyrics('d0000000-0000-0000-0000-000000000001') where version = 'original'), 'chords present when allowed';
  assert (select count(*) from public.get_lyrics('d0000000-0000-0000-0000-000000000002')) = 0, 'song missing a consent returns nothing';
  assert (select count(*) from public.get_lyrics('d0000000-0000-0000-0000-000000000005')) = 0, 'song of an expired artist returns nothing';
  raise notice 'ok: lyrics for live songs only';
end $$;
rollback;

begin;
update public.agreements set allow_chords = false, allow_translations = false where id = 'b0000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.get_lyrics('d0000000-0000-0000-0000-000000000001')) = 1, 'translations withheld when not allowed';
  assert (select body !~ '\[' and not has_chords from public.get_lyrics('d0000000-0000-0000-0000-000000000001')), 'chords stripped when not allowed';
  raise notice 'ok: chords and translations follow the agreement flags';
end $$;
rollback;

begin;
update public.agreements set allow_lyrics = false where id = 'b0000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.get_lyrics('d0000000-0000-0000-0000-000000000001')) = 0, 'no lyrics when the agreement does not allow lyrics';
  raise notice 'ok: allow_lyrics enforced';
end $$;
rollback;

-- ============================================================ fail closed on dates
begin;
update public.agreements set expires_on = public.app_today() - 1 where id = 'b0000000-0000-0000-0000-000000000001';
set local role anon;
do $$ begin
  assert (select count(*) from public.v_songs) = 0, 'agreement expired yesterday hides every song';
  assert (select available from public.v_artists where slug = 'grace-worship') = false, 'artist becomes Unavailable';
  assert (select bio is null from public.v_artists where slug = 'grace-worship'), 'artist details withheld once unavailable';
  raise notice 'ok: expired agreement hides songs, artist shows Unavailable';
end $$;
rollback;

begin;
update public.agreements set expires_on = public.app_today() where id = 'b0000000-0000-0000-0000-000000000001';
set local role anon;
do $$ begin
  assert (select count(*) from public.v_songs) = 2, 'agreement expiring today is still valid through today';
  raise notice 'ok: expiry date is inclusive';
end $$;
rollback;

begin;
update public.agreements set starts_on = public.app_today() + 1 where id = 'b0000000-0000-0000-0000-000000000001';
set local role anon;
do $$ begin
  assert (select count(*) from public.v_songs) = 0, 'agreement that has not started yet shows nothing';
  raise notice 'ok: not-yet-started agreement';
end $$;
rollback;

begin;
update public.agreements set status = 'revoked' where id = 'b0000000-0000-0000-0000-000000000001';
set local role anon;
do $$ begin
  assert (select count(*) from public.v_songs) = 0, 'revoked agreement hides every song';
  raise notice 'ok: revoked agreement';
end $$;
rollback;

begin;
update public.song_credits set consent_status = 'granted' where person_name = 'Writer Three';
set local role anon;
do $$ begin
  assert (select count(*) from public.v_songs where slug = 'placeholder-song-two') = 1, 'song goes live once the last writer consents';
  raise notice 'ok: consent granted makes the song live';
end $$;
rollback;

begin;
update public.song_credits set consent_expires_on = public.app_today() where person_name = 'Writer Four';
set local role anon;
do $$ begin
  assert (select count(*) from public.v_songs where slug = 'placeholder-song-three') = 1, 'consent expiring today is still valid';
  raise notice 'ok: consent expiry is inclusive';
end $$;
rollback;

begin;
update public.song_credits set consent_status = 'revoked' where person_name = 'Writer One';
set local role anon;
do $$ begin
  assert (select count(*) from public.v_songs where slug = 'placeholder-song-one') = 0, 'a revoked writer hides the song';
  raise notice 'ok: revoked consent hides the song';
end $$;
rollback;

begin;
delete from public.song_credits where person_name = 'Writer Five';
set local role anon;
do $$ begin
  assert (select count(*) from public.v_songs where slug = 'placeholder-single') = 0, 'a song with no writer credit is never live';
  raise notice 'ok: no writer, not live';
end $$;
rollback;

begin;
update public.songs set hidden_by_admin = false where slug = 'placeholder-takedown';
update public.songs set is_published = false where slug = 'placeholder-song-one';
set local role anon;
do $$ begin
  assert (select count(*) from public.v_songs where slug = 'placeholder-takedown') = 1, 'lifting the takedown restores the song';
  assert (select count(*) from public.v_songs where slug = 'placeholder-song-one') = 0, 'unpublished song is hidden';
  raise notice 'ok: takedown switch and unpublish';
end $$;
rollback;

-- ============================================================ users cannot touch admin data or their own role
begin;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.agreements) = 0,   'user sees no agreements';
  assert (select count(*) from public.requests) = 0,     'user sees no requests or prices';
  assert (select count(*) from public.posters) = 0,      'user sees no raw posters (no end dates)';
  assert (select count(*) from public.songs) = 0,        'user sees no raw songs';
  assert (select count(*) from public.lyrics) = 0,       'user sees no raw lyrics';
  assert (select count(*) from public.song_credits) = 0, 'user sees no credits or contacts';
  assert (select count(*) from public.audit_log) = 0,    'user sees no audit log';
  assert (select count(*) from public.v_admin_songs) = 0, 'admin views return nothing to users';
  assert (select count(*) from public.v_expiry_watch) = 0, 'expiry watch returns nothing to users';
  assert (select count(*) from public.profiles) = 1,     'user sees only their own profile';
  update public.profiles set display_name = 'Renamed', region_code = 'IN-TN', language_codes = '{ta,en}'
    where id = '11111111-1111-1111-1111-111111111111';
  assert (select display_name from public.profiles where id = '11111111-1111-1111-1111-111111111111') = 'Renamed', 'user can edit own profile';
  raise notice 'ok: admin data invisible to users';
end $$;
select test_helpers.expect_error($q$update public.profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111'$q$, '42501');
select test_helpers.expect_error($q$insert into public.agreements (artist_id) values ('a0000000-0000-0000-0000-000000000001')$q$, '42501');
select test_helpers.expect_error($q$insert into public.requests (kind, channel, contact) values ('promotion','email','x@example.org')$q$, '42501');
select test_helpers.expect_error($q$delete from public.audit_log$q$, '42501');
select test_helpers.expect_error($q$insert into public.play_events (user_id, song_id, kind) values ('11111111-1111-1111-1111-111111111111','d0000000-0000-0000-0000-000000000001','play')$q$, '42501');
select test_helpers.expect_error($q$update public.profiles set language_codes = '{xx}' where id = '11111111-1111-1111-1111-111111111111'$q$, '23514');
select test_helpers.expect_error($q$select public.song_visibility('d0000000-0000-0000-0000-000000000002')$q$, '42501');
rollback;

-- ============================================================ likes and playlists
begin;
insert into public.song_likes (user_id, song_id) values ('22222222-2222-2222-2222-222222222222', 'd0000000-0000-0000-0000-000000000004');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.song_likes) = 0, 'user cannot see another user''s likes';
  insert into public.song_likes (user_id, song_id) values ('11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001');
  assert (select count(*) from public.my_liked_songs()) = 1, 'liked list shows the live song';
  raise notice 'ok: likes are private';
end $$;
select test_helpers.expect_error($q$insert into public.song_likes (user_id, song_id) values ('11111111-1111-1111-1111-111111111111','d0000000-0000-0000-0000-000000000002')$q$, '42501');
select test_helpers.expect_error($q$insert into public.song_likes (user_id, song_id) values ('22222222-2222-2222-2222-222222222222','d0000000-0000-0000-0000-000000000001')$q$, '42501');
rollback;

-- ============================================================ song covers come from published albums only
begin;
update public.albums set cover_url = 'https://example.org/morning-light.jpg' where slug = 'morning-light';
set local role anon;
do $$ begin
  assert (select cover_url from public.v_songs where slug = 'placeholder-song-one') = 'https://example.org/morning-light.jpg', 'a song shows its album cover';
  assert (select cover_url from public.v_songs where slug = 'placeholder-single') is null, 'a single has no cover';
  raise notice 'ok: song covers come from the album';
end $$;
reset role;
update public.albums set is_published = false where slug = 'morning-light';
set local role anon;
do $$ begin
  assert (select cover_url from public.v_songs where slug = 'placeholder-song-one') is null, 'an unpublished album shows no cover';
  assert (select album_title from public.v_songs where slug = 'placeholder-song-one') is null, 'and no album title';
  raise notice 'ok: an unpublished album shows no cover';
end $$;
rollback;

-- ============================================================ deleting your own account
begin;
insert into auth.users (id, email) values ('44444444-0000-0000-0000-0000000000dd', 'leaver@example.invalid');
insert into public.song_likes (user_id, song_id) values ('44444444-0000-0000-0000-0000000000dd', 'd0000000-0000-0000-0000-000000000001');
insert into public.artist_follows (user_id, artist_id) values ('44444444-0000-0000-0000-0000000000dd', 'a0000000-0000-0000-0000-000000000001');
insert into public.playlists (user_id, name) values ('44444444-0000-0000-0000-0000000000dd', 'My list');
insert into public.listen_sessions (user_id, song_id, listened_s, qualified_at)
  values ('44444444-0000-0000-0000-0000000000dd', 'd0000000-0000-0000-0000-000000000001', 60, now());
set local role anon;
select test_helpers.expect_error($q$select public.delete_my_account()$q$, '42501');   -- a visitor has no execute right
reset role;
select set_config('request.jwt.claim.sub', '44444444-0000-0000-0000-0000000000dd', true);
set local role authenticated;
select public.delete_my_account();
reset role;
do $$ begin
  assert not exists (select 1 from auth.users where id = '44444444-0000-0000-0000-0000000000dd'), 'the sign-in record is gone';
  assert not exists (select 1 from public.profiles where id = '44444444-0000-0000-0000-0000000000dd'), 'the profile is gone';
  assert not exists (select 1 from public.song_likes where user_id = '44444444-0000-0000-0000-0000000000dd'), 'likes are gone';
  assert not exists (select 1 from public.artist_follows where user_id = '44444444-0000-0000-0000-0000000000dd'), 'follows are gone';
  assert not exists (select 1 from public.playlists where user_id = '44444444-0000-0000-0000-0000000000dd'), 'lists are gone';
  assert not exists (select 1 from public.listen_sessions where user_id = '44444444-0000-0000-0000-0000000000dd'), 'listening records are gone';
  assert exists (select 1 from auth.users where id = '11111111-1111-1111-1111-111111111111'), 'other people are untouched';
  assert exists (select 1 from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'other profiles are untouched';
  raise notice 'ok: a person can delete their own account and everything attached to it';
end $$;
rollback;

begin;
-- an admin is refused, and nothing is removed
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
set local role authenticated;
select test_helpers.expect_error($q$select public.delete_my_account()$q$, '42501');
reset role;
do $$ begin
  assert exists (select 1 from auth.users where id = '00000000-0000-0000-0000-0000000000aa'), 'the admin account is still there';
  raise notice 'ok: an admin account cannot be deleted from the app';
end $$;
rollback;

begin;
-- someone who is not signed in at all (no user id on the request) cannot run it
select set_config('request.jwt.claim.sub', '', true);
set local role authenticated;
select test_helpers.expect_error($q$select public.delete_my_account()$q$, '28000');
rollback;

-- ============================================================ the pictures bucket
begin;
do $$ begin
  assert (select public from storage.buckets where id = 'pictures') = true, 'the pictures bucket is public for reading';
  assert (select file_size_limit from storage.buckets where id = 'pictures') = 2097152, 'pictures are limited to 2 MB';
  assert (select allowed_mime_types from storage.buckets where id = 'pictures') = array['image/jpeg', 'image/png', 'image/webp'], 'only image types are accepted';
  assert (select public from storage.buckets where id = 'audio') = false, 'the audio bucket stays private';
  raise notice 'ok: pictures bucket shape';
end $$;
set local role anon;
select test_helpers.expect_error($q$insert into storage.objects (bucket_id, name) values ('pictures', 'artist/anon.webp')$q$, '42501');
reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
select test_helpers.expect_error($q$insert into storage.objects (bucket_id, name) values ('pictures', 'artist/user.webp')$q$, '42501');
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
set local role authenticated;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('pictures', 'artist/admin.webp');
  assert (select count(*) from storage.objects where bucket_id = 'pictures') = 1, 'an admin can add and see a picture';
  raise notice 'ok: only admins write pictures';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from storage.objects where bucket_id = 'pictures') = 0, 'a normal user cannot list the pictures bucket';
  raise notice 'ok: pictures cannot be listed by users';
end $$;
reset role;
rollback;

-- ============================================================ a song's own cover wins over its album's
begin;
update public.albums set cover_url = 'https://example.org/morning-light.jpg' where slug = 'morning-light';
update public.songs set cover_url = 'https://example.org/own-cover.jpg' where slug = 'placeholder-song-one';
update public.songs set cover_url = 'https://example.org/single-cover.jpg' where slug = 'placeholder-single';
set local role anon;
do $$ begin
  assert (select cover_url from public.v_songs where slug = 'placeholder-song-one') = 'https://example.org/own-cover.jpg', 'a song shows its own cover before its album cover';
  assert (select cover_url from public.v_songs where slug = 'placeholder-single') = 'https://example.org/single-cover.jpg', 'a single can have its own cover';
  raise notice 'ok: a song own cover wins over its album cover';
end $$;
reset role;
update public.songs set cover_url = null where slug = 'placeholder-song-one';
set local role anon;
do $$ begin
  assert (select cover_url from public.v_songs where slug = 'placeholder-song-one') = 'https://example.org/morning-light.jpg', 'without its own cover a song shows its album cover';
  raise notice 'ok: without its own cover a song falls back to the album cover';
end $$;
reset role;
select test_helpers.expect_error($q$update public.songs set cover_url = 'http://example.org/not-secure.jpg' where slug = 'placeholder-song-one'$q$, '23514');
select test_helpers.expect_error($q$update public.songs set cover_url = 'https://example.org/has space.jpg' where slug = 'placeholder-song-one'$q$, '23514');
rollback;

-- ============================================================ following artists
begin;
insert into public.artist_follows (user_id, artist_id) values ('22222222-2222-2222-2222-222222222222', 'a0000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.artist_follows) = 0, 'user cannot see another user''s follows';
  insert into public.artist_follows (user_id, artist_id) values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001');
  assert (select count(*) from public.my_followed_artists()) = 1, 'followed list shows the artist';
  assert (select slug from public.my_followed_artists()) = 'grace-worship', 'it is the artist that was followed';
  delete from public.artist_follows where user_id = '22222222-2222-2222-2222-222222222222';
  perform set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
  assert (select count(*) from public.my_followed_artists()) = 1, 'nobody can unfollow for someone else';
  perform set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
  delete from public.artist_follows where artist_id = 'a0000000-0000-0000-0000-000000000001';
  assert (select count(*) from public.my_followed_artists()) = 0, 'a person can unfollow';
  raise notice 'ok: follows are private';
end $$;
-- Only an available artist can be newly followed: not the one whose agreement ended, not an unpublished one, not for somebody else.
select test_helpers.expect_error($q$insert into public.artist_follows (user_id, artist_id) values ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000002')$q$, '42501');
select test_helpers.expect_error($q$insert into public.artist_follows (user_id, artist_id) values ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000003')$q$, '42501');
select test_helpers.expect_error($q$insert into public.artist_follows (user_id, artist_id) values ('22222222-2222-2222-2222-222222222222','a0000000-0000-0000-0000-000000000001')$q$, '42501');
rollback;

begin;
set local role anon;
select test_helpers.expect_error($q$select * from public.artist_follows$q$, '42501');
select test_helpers.expect_error($q$select * from public.my_followed_artists()$q$, '42501');
rollback;

-- An artist who becomes unavailable stays in the list, as a name only; and the limit of 500 follows holds.
begin;
insert into public.artist_follows (user_id, artist_id) values ('11111111-1111-1111-1111-111111111111', 'a0000000-0000-0000-0000-000000000001');
update public.agreements set status = 'revoked' where artist_id = 'a0000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.my_followed_artists()) = 1, 'the followed artist stays in the list';
  assert (select available = false and bio is null and photo_url is null from public.my_followed_artists()), 'but shows as a name only';
  raise notice 'ok: an unavailable artist stays followed, as a name';
end $$;
rollback;

begin;
insert into public.artists (id, slug, name, is_published)
  select gen_random_uuid(), 'follow-limit-' || n, 'Follow limit ' || n, true from generate_series(1, 500) n;
insert into public.artist_follows (user_id, artist_id)
  select '11111111-1111-1111-1111-111111111111', id from public.artists where slug like 'follow-limit-%';
select test_helpers.expect_error($q$insert into public.artist_follows (user_id, artist_id) values ('11111111-1111-1111-1111-111111111111','a0000000-0000-0000-0000-000000000001')$q$, '54000');
rollback;

begin;
insert into public.playlists (id, user_id, name, kind) values ('99999999-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'Sunday', 'setlist');
insert into public.playlist_items (playlist_id, song_id, position) values
  ('99999999-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 1),
  ('99999999-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 2);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.my_playlist_items('99999999-0000-0000-0000-000000000001')) = 2, 'both slots are kept';
  assert (select available and title is not null from public.my_playlist_items('99999999-0000-0000-0000-000000000001') where position = 1), 'live song shows its title';
  assert (select not available and title is null and artist_name is null and slug is null
            from public.my_playlist_items('99999999-0000-0000-0000-000000000001') where position = 2), 'hidden song shows as an unavailable slot only';
  raise notice 'ok: hidden songs stay in setlists as unavailable slots';
end $$;
select test_helpers.expect_error($q$insert into public.playlist_items (playlist_id, song_id, position) values ('99999999-0000-0000-0000-000000000001','d0000000-0000-0000-0000-000000000002',3)$q$, '42501');
rollback;

begin;
insert into public.playlists (id, user_id, name) values ('99999999-0000-0000-0000-000000000002', '22222222-2222-2222-2222-222222222222', 'Not yours');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.playlists) = 0, 'user cannot see another user''s playlists';
  assert (select count(*) from public.my_playlist_items('99999999-0000-0000-0000-000000000002')) = 0, 'nor their items';
  raise notice 'ok: playlists are private';
end $$;
select test_helpers.expect_error($q$insert into public.playlist_items (playlist_id, song_id, position) values ('99999999-0000-0000-0000-000000000002','d0000000-0000-0000-0000-000000000001',1)$q$, '42501');
rollback;

-- ============================================================ posters on Home
begin;
set local role anon;
do $$
declare
  ids uuid[];
begin
  select array_agg(id order by match_rank desc, title) into ids from public.home_posters('{ta}', 'IN-TN');
  assert ids = array['f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002']::uuid[],
         'Tamil + Tamil Nadu sees the both-match poster first, then the everyone poster; ended, passed, future, refunded and either-poster excluded';
  assert (select match_rank from public.home_posters('{ta}', 'IN-TN') where title = 'Poster both') = 3, 'both match ranks 3';
  assert (select match_rank from public.home_posters('{ta}', 'IN-TN') where title = 'Poster everyone') = 1, 'everyone ranks 1';

  select array_agg(id) into ids from public.home_posters('{en}', 'IN-KL');
  assert ids = array['f0000000-0000-0000-0000-000000000002']::uuid[], 'a both-poster is not shown when only the region matches... or only the language';

  select array_agg(id order by match_rank desc) into ids from public.home_posters('{hi}', null);
  assert ids = array['f0000000-0000-0000-0000-000000000005', 'f0000000-0000-0000-0000-000000000002']::uuid[], 'either-poster shows on one match and ranks above everyone';

  select array_agg(id) into ids from public.home_posters('{}', 'IN-MH');
  assert 'f0000000-0000-0000-0000-000000000005' = any (ids), 'either-poster shows on region match alone';

  assert (select count(*) from public.home_posters('{}', null, 1)) = 1, 'limit is honoured';
  assert pg_get_function_result('public.home_posters(text[],text,int)'::regprocedure) !~ 'ends_at|starts_at|amount|price',
         'poster result has no start, end or price columns';
  raise notice 'ok: poster targeting, ranking and auto-expiry';
end $$;
rollback;

begin;
update public.posters set ends_at = now() - interval '1 second' where id = 'f0000000-0000-0000-0000-000000000002';
set local role anon;
do $$ begin
  assert (select count(*) from public.home_posters('{ta}', 'IN-TN') where title = 'Poster everyone') = 0, 'poster disappears the moment its paid period ends, with no job running';
  raise notice 'ok: poster ends on time';
end $$;
rollback;

begin;
update public.posters set status = 'paused' where id = 'f0000000-0000-0000-0000-000000000001';
set local role anon;
do $$ begin
  assert (select count(*) from public.home_posters('{ta}', 'IN-TN') where title = 'Poster both') = 0, 'paused poster is not shown';
  raise notice 'ok: paused poster';
end $$;
rollback;

-- ============================================================ admin rules
begin;
select test_helpers.expect_error($q$insert into public.posters (request_id, kind, title, image_url, status, starts_at, ends_at)
  values ('e0000000-0000-0000-0000-000000000004', 'event', 't', 'u', 'approved', now(), now() + interval '1 day')$q$, '23514');
select test_helpers.expect_error($q$insert into public.posters (kind, title, image_url, status, starts_at, ends_at)
  values ('event', 't', 'u', 'approved', now(), now() + interval '1 day')$q$, '23514');
select test_helpers.expect_error($q$insert into public.posters (request_id, kind, title, image_url, status)
  values ('e0000000-0000-0000-0000-000000000001', 'event', 't', 'u', 'approved')$q$, '23514');
select test_helpers.expect_error($q$insert into public.posters (kind, title, image_url, match_mode, target_language_codes)
  values ('event', 't', 'u', 'both', '{ta}')$q$, '23514');
select test_helpers.expect_error($q$insert into public.agreements (artist_id, status, document_ref)
  values ('a0000000-0000-0000-0000-000000000003', 'verified', null)$q$, '23514');
select test_helpers.expect_error($q$insert into public.artists (slug, name, genres) values ('bad-genre', 'x', '{dubstep}')$q$, '23514');
select test_helpers.expect_error($q$insert into public.artists (slug, name, language_codes) values ('bad-lang', 'x', '{zz}')$q$, '23514');
select test_helpers.expect_error($q$insert into public.songs (artist_id, slug, title, language_code, moods)
  values ('a0000000-0000-0000-0000-000000000001', 'bad-mood', 'x', 'ta', '{grumpy}')$q$, '23514');
select test_helpers.expect_error($q$insert into public.artists (slug, name) values ('Bad Slug', 'x')$q$, '23514');
do $$ begin raise notice 'ok: integrity rules (verified requester, proof of agreement, controlled lists)'; end $$;
rollback;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
set local role authenticated;
do $$
declare
  before_count bigint;
begin
  assert (select count(*) from public.agreements) = 2, 'admin sees agreements';
  assert (select count(*) from public.requests) = 4,   'admin sees requests with amounts';
  assert (select count(*) from public.posters) = 7,    'admin sees raw posters';
  assert (select count(*) from public.v_admin_songs) = 6, 'admin sees all songs with reasons';
  assert (select visibility from public.v_admin_songs where slug = 'placeholder-song-one')   = 'live',               'S1 live';
  assert (select visibility from public.v_admin_songs where slug = 'placeholder-song-two')   = 'consent_missing',    'S2 consent_missing';
  assert (select visibility from public.v_admin_songs where slug = 'placeholder-song-three') = 'consent_expired',    'S3 consent_expired';
  assert (select visibility from public.v_admin_songs where slug = 'placeholder-single')     = 'live',               'S4 live';
  assert (select visibility from public.v_admin_songs where slug = 'placeholder-hymn')       = 'agreement_inactive', 'S5 agreement_inactive';
  assert (select visibility from public.v_admin_songs where slug = 'placeholder-takedown')   = 'taken_down',        'S6 taken_down';
  assert (select consent_people = 2 and consent_granted = 2 from public.v_admin_songs where slug = 'placeholder-song-one'), 'consent counts';
  assert (select consent_people = 2 and consent_granted = 1 from public.v_admin_songs where slug = 'placeholder-song-two'), 'consent counts, one pending';
  assert (select live_song_count = 2 and song_count = 5 from public.v_admin_artists where slug = 'grace-worship'), 'artist roll-up';
  assert (select not available from public.v_admin_artists where slug = 'shalom-choir'), 'expired artist flagged';
  assert (select count(*) from public.v_expiry_watch where kind = 'agreement') = 0, 'nothing expires within 60 days in the seed';

  select count(*) into before_count from public.audit_log;
  update public.songs set title = 'Placeholder Song One (edited)' where slug = 'placeholder-song-one';
  assert (select count(*) from public.audit_log) = before_count + 1, 'edit is written to the audit log';
  assert (select actor from public.audit_log order by id desc limit 1) = '00000000-0000-0000-0000-0000000000aa', 'audit log records who did it';
  assert (select old_row ->> 'title' from public.audit_log order by id desc limit 1) = 'Placeholder Song One', 'audit log keeps the old value';
  raise notice 'ok: admin visibility, reasons and audit trail';
end $$;
select test_helpers.expect_error($q$delete from public.audit_log$q$, '42501');
select test_helpers.expect_error($q$update public.audit_log set action = 'x'$q$, '42501');
rollback;

begin;
update public.agreements set expires_on = public.app_today() + 20 where id = 'b0000000-0000-0000-0000-000000000001';
update public.song_credits set consent_expires_on = public.app_today() + 5 where person_name = 'Writer One';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
set local role authenticated;
do $$ begin
  assert (select days_left from public.v_expiry_watch where kind = 'agreement') = 20, 'agreement expiring in 20 days is on the watch list';
  assert (select days_left from public.v_expiry_watch where kind = 'consent' and person_name = 'Writer One') = 5, 'consent expiring in 5 days is on the watch list';
  raise notice 'ok: expiry watch list';
end $$;
rollback;

-- ============================================================ listening data
begin;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  perform public.record_play('d0000000-0000-0000-0000-000000000001');
  perform public.record_play('d0000000-0000-0000-0000-000000000001');
  perform public.record_play('d0000000-0000-0000-0000-000000000002');
  perform public.record_play('d0000000-0000-0000-0000-000000000001', 'bogus');
  perform public.record_play('d0000000-0000-0000-0000-000000000001', 'lyrics_open');
  raise notice 'ok: record_play ran';
end $$;
reset role;
do $$ begin
  assert (select count(*) from public.play_events where kind = 'play') = 1, 'duplicate plays within 30 minutes are ignored';
  assert (select count(*) from public.play_events where kind = 'lyrics_open') = 1, 'lyrics opens are counted separately';
  assert (select count(*) from public.play_events where song_id = 'd0000000-0000-0000-0000-000000000002') = 0, 'hidden songs record nothing';
  raise notice 'ok: play events';
end $$;
rollback;

begin;
insert into auth.users (id, email) select ('33333333-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'l' || g || '@example.invalid' from generate_series(1, 12) g;
-- 12 people opened lyrics: that is reading, not listening, so it must not count
insert into public.play_events (user_id, song_id, kind)
  select ('33333333-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'd0000000-0000-0000-0000-000000000001', 'lyrics_open' from generate_series(1, 12) g;
-- 3 real listeners (40 s each), then below the minimum
insert into public.listen_sessions (user_id, song_id, listened_s, qualified_at)
  select ('33333333-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'd0000000-0000-0000-0000-000000000001', 40, now() from generate_series(1, 3) g;
set local role anon;
do $$ begin
  assert public.artist_monthly_listeners('a0000000-0000-0000-0000-000000000001') is null, 'below the minimum the number is hidden (lyrics opens do not count)';
  raise notice 'ok: monthly listeners hidden below minimum';
end $$;
reset role;
-- 9 more real listeners on another song of the same artist (12 total), plus things that must not count:
-- someone who listened under 30 s, a qualified listen 40 days ago, and an admin who listened a lot
insert into public.listen_sessions (user_id, song_id, listened_s, qualified_at)
  select ('33333333-0000-0000-0000-' || lpad(g::text, 12, '0'))::uuid, 'd0000000-0000-0000-0000-000000000004', 35, now() from generate_series(4, 12) g;
insert into public.listen_sessions (user_id, song_id, listened_s, qualified_at) values
  ('22222222-2222-2222-2222-222222222222', 'd0000000-0000-0000-0000-000000000001', 12, null),
  ('22222222-2222-2222-2222-222222222222', 'd0000000-0000-0000-0000-000000000001', 90, now() - interval '40 days'),
  ('00000000-0000-0000-0000-0000000000aa', 'd0000000-0000-0000-0000-000000000001', 600, now());
set local role anon;
do $$ begin
  assert public.artist_monthly_listeners('a0000000-0000-0000-0000-000000000001') = 12, '12 distinct people with 30+ s in 30 days; short, old, repeated and admin listens do not count';
  assert public.artist_monthly_listeners('a0000000-0000-0000-0000-000000000002') is null, 'unavailable artist shows no number';
  assert (select count(*) from public.trending_songs('{ta}', 'IN-TN')) = 1, 'trending respects language';
  assert (select slug from public.trending_songs('{}', null) limit 1) = 'placeholder-single', 'the song with the most listeners in the last 7 days ranks first';
  assert (select count(*) from public.trending_songs('{}', 'LK')) = 0, 'trending respects region';
  assert (select count(*) from public.trending_songs('{}', 'IN-KL')) = 2, 'same-country region matches';
  raise notice 'ok: monthly listeners and trending';
end $$;
rollback;

-- ============================================================ record_listen: time cannot be forged
begin;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$
declare r record; sid uuid;
begin
  select * into r from public.record_listen(null, 'd0000000-0000-0000-0000-000000000001', 20);
  assert r.total_s = 0 and r.qualified = false, 'a new session only starts the clock';
  sid := r.session_id;
  select * into r from public.record_listen(sid, 'd0000000-0000-0000-0000-000000000001', 20);
  assert r.total_s <= 1, 'claiming 20 s with no time passed is capped to the time that passed';
  perform set_config('test.sid', sid::text, true);
  perform set_config('test.before', r.total_s::text, true);
  raise notice 'ok: new session and instant claim';
end $$;
-- pretend 60 s went by; a report of 100 s is still limited to 20 s per report
reset role;
update public.listen_sessions set last_beat_at = now() - interval '60 seconds' where id = current_setting('test.sid')::uuid;
set local role authenticated;
do $$
declare r record; before_s int := current_setting('test.before')::int;
begin
  select * into r from public.record_listen(current_setting('test.sid')::uuid, 'd0000000-0000-0000-0000-000000000001', 100);
  assert r.total_s - before_s = 20, 'one report credits at most 20 s';
  assert r.qualified = false, 'about 21 s is not yet a listen';
  raise notice 'ok: per-report cap';
end $$;
reset role;
update public.listen_sessions set last_beat_at = now() - interval '20 seconds' where id = current_setting('test.sid')::uuid;
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.record_listen(current_setting('test.sid')::uuid, 'd0000000-0000-0000-0000-000000000001', 20);
  assert r.total_s between 40 and 42 and r.qualified = true, 'passing 30 s makes it a listen';
  perform set_config('test.before', r.total_s::text, true);
  -- a second session on another song starts now and shares the person's clock
  perform public.record_listen(null, 'd0000000-0000-0000-0000-000000000004', 0);
  raise notice 'ok: qualification';
end $$;
-- 20 s later the first session reports again, but the person's other session has just reported: no time is left to credit
reset role;
update public.listen_sessions set last_beat_at = now() - interval '20 seconds' where id = current_setting('test.sid')::uuid;
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.record_listen(current_setting('test.sid')::uuid, 'd0000000-0000-0000-0000-000000000001', 20);
  assert r.total_s - current_setting('test.before')::int <= 1, 'parallel sessions cannot add up to more than real time';
  raise notice 'ok: shared clock';
end $$;
-- users cannot read or write the table directly
do $$ begin
  assert (select count(*) from public.listen_sessions) = 0, 'a normal user sees no listening rows, not even their own';
end $$;
select test_helpers.expect_error($q$insert into public.listen_sessions (user_id, song_id, listened_s, qualified_at) values ('11111111-1111-1111-1111-111111111111','d0000000-0000-0000-0000-000000000001', 99, now())$q$, '42501');
select test_helpers.expect_error($q$update public.listen_sessions set listened_s = 86400$q$, '42501');
select test_helpers.expect_error($q$delete from public.listen_sessions$q$, '42501');
rollback;

begin;
-- hidden songs record nothing; another person's session id cannot be reused; daily cap; session flood limit
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$
declare r record; sid uuid;
begin
  assert not exists (select 1 from public.record_listen(null, 'd0000000-0000-0000-0000-000000000002', 0)), 'hidden song: no session';
  select * into r from public.record_listen(null, 'd0000000-0000-0000-0000-000000000001', 0);
  sid := r.session_id;
  perform set_config('test.sid', sid::text, true);
end $$;
reset role;
select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.record_listen(current_setting('test.sid')::uuid, 'd0000000-0000-0000-0000-000000000001', 20);
  assert r.session_id <> current_setting('test.sid')::uuid and r.total_s = 0, 'someone else''s session id starts a fresh session instead';
  raise notice 'ok: hidden song and foreign session';
end $$;
reset role;
rollback;

begin;
-- daily cap: after 8 hours in a day nothing more is credited
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.record_listen(null, 'd0000000-0000-0000-0000-000000000001', 0);
  perform set_config('test.sid', r.session_id::text, true);
end $$;
reset role;
update public.listen_sessions set listened_s = 28800, qualified_at = now(), last_beat_at = now() - interval '20 seconds'
 where id = current_setting('test.sid')::uuid;
set local role authenticated;
do $$
declare r record;
begin
  select * into r from public.record_listen(current_setting('test.sid')::uuid, 'd0000000-0000-0000-0000-000000000001', 20);
  assert r.total_s = 28800, 'no credit after 8 hours in one day';
  raise notice 'ok: daily cap';
end $$;
rollback;

begin;
-- session flood: at most 120 new sessions per hour per person
insert into public.listen_sessions (user_id, song_id)
  select '11111111-1111-1111-1111-111111111111', 'd0000000-0000-0000-0000-000000000001' from generate_series(1, 120);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert not exists (select 1 from public.record_listen(null, 'd0000000-0000-0000-0000-000000000001', 0)), 'the 121st session in an hour is refused';
  raise notice 'ok: session limit';
end $$;
rollback;
begin;
insert into auth.users (id, email) values ('44444444-0000-0000-0000-000000000001', 'x@example.invalid'), ('44444444-0000-0000-0000-000000000002', 'y@example.invalid');
insert into public.song_likes (user_id, song_id) values
  ('44444444-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004'),
  ('44444444-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000004'),
  ('44444444-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001');
select set_config('request.jwt.claim.sub', '44444444-0000-0000-0000-000000000001', true);
set local role authenticated;
do $$ begin
  assert (select slug from public.most_liked_songs() limit 1) = 'placeholder-single', 'most liked orders by like count';
  assert (select like_count from public.v_songs where slug = 'placeholder-single') = 2, 'like count is public, who liked is not';
  assert (select count(*) from public.suggested_songs()) = 0, 'user already liked every live song, so nothing to suggest';
  delete from public.song_likes where song_id = 'd0000000-0000-0000-0000-000000000001' and user_id = '44444444-0000-0000-0000-000000000001';
  assert (select slug from public.suggested_songs() limit 1) = 'placeholder-song-one', 'unliked song by a liked artist is suggested';
  raise notice 'ok: most liked and suggested';
end $$;
rollback;

-- ============================================================ hosted audio
begin;
-- S1 live, S2 hidden (a writer has not consented), S4 live. Give all three a file.
update public.songs set audio_path = id::text || '/track.mp3', audio_mime = 'audio/mpeg', audio_bytes = 1000
 where id in ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000004');
insert into storage.objects (bucket_id, name) values
  ('audio', 'd0000000-0000-0000-0000-000000000001/track.mp3'),
  ('audio', 'd0000000-0000-0000-0000-000000000002/track.mp3'),
  ('audio', 'd0000000-0000-0000-0000-000000000004/track.mp3');

set local role anon;
do $$ begin
  assert (select count(*) from storage.objects) = 0, 'anonymous visitors see no audio files';
  assert (select has_audio from public.v_songs where slug = 'placeholder-song-one') = true, 'the catalogue says a song has audio';
  assert (select has_audio from public.v_songs where slug = 'placeholder-single') = true, 'second live song has audio';
  raise notice 'ok: audio invisible to anonymous visitors';
end $$;
select test_helpers.expect_error($q$select audio_path from public.v_songs$q$, '42703');
select test_helpers.expect_error($q$select public.song_audio_path('d0000000-0000-0000-0000-000000000001')$q$, '42501');
reset role;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert public.song_audio_path('d0000000-0000-0000-0000-000000000001') = 'd0000000-0000-0000-0000-000000000001/track.mp3', 'a signed-in user gets the path of a live song';
  assert public.song_audio_path('d0000000-0000-0000-0000-000000000002') is null, 'a hidden song gives no path';
  assert public.song_audio_path('d0000000-0000-0000-0000-000000000003') is null, 'a song with no file gives no path';
  assert (select count(*) from storage.objects) = 2, 'a signed-in user can read the files of live songs only';
  assert not exists (select 1 from storage.objects where name like 'd0000000-0000-0000-0000-000000000002/%'), 'the hidden song''s file is not readable';
  raise notice 'ok: audio readable only for live songs';
end $$;
select test_helpers.expect_error($q$insert into storage.objects (bucket_id, name) values ('audio', 'd0000000-0000-0000-0000-000000000001/evil.mp3')$q$, '42501');
do $$ declare n int; begin update public.songs set audio_path = 'x/y.mp3'; get diagnostics n = row_count; assert n = 0, 'a normal user cannot change any song'; end $$;
reset role;

-- the artist's agreement ends: the file stops being readable at once, no clean-up needed
update public.agreements set expires_on = public.app_today() - 1 where id = 'b0000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from storage.objects) = 0, 'expired agreement: no file is readable';
  assert public.song_audio_path('d0000000-0000-0000-0000-000000000001') is null, 'expired agreement: no path';
  raise notice 'ok: audio stops with the agreement';
end $$;
reset role;
rollback;

begin;
-- Hosting audio is its own right. The agreement stops allowing it: lyrics stay, the file and the play button go.
update public.songs set audio_path = id::text || '/track.mp3', audio_mime = 'audio/mpeg', audio_bytes = 1000
 where id in ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004');
insert into storage.objects (bucket_id, name) values
  ('audio', 'd0000000-0000-0000-0000-000000000001/track.mp3'),
  ('audio', 'd0000000-0000-0000-0000-000000000004/track.mp3');
update public.agreements set allow_audio_hosting = false where id = 'b0000000-0000-0000-0000-000000000001';

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select has_audio from public.v_songs where slug = 'placeholder-song-one') = false, 'no audio right: the song shows as lyrics-only';
  assert (select count(*) from public.v_songs where slug = 'placeholder-song-one') = 1, 'the song itself stays visible';
  assert public.song_audio_path('d0000000-0000-0000-0000-000000000001') is null, 'no audio right: no path';
  assert (select count(*) from storage.objects) = 0, 'no audio right: no file is readable';
  assert (select count(*) from public.get_lyrics('d0000000-0000-0000-0000-000000000001')) > 0, 'lyrics are not affected';
  raise notice 'ok: audio needs allow_audio_hosting';
end $$;
reset role;

-- and when the flag comes back, so does the audio, with nothing else to do
update public.agreements set allow_audio_hosting = true where id = 'b0000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select has_audio from public.v_songs where slug = 'placeholder-song-one') = true, 'flag back on: has audio again';
  assert public.song_audio_path('d0000000-0000-0000-0000-000000000001') = 'd0000000-0000-0000-0000-000000000001/track.mp3', 'flag back on: path again';
  assert (select count(*) from storage.objects) = 2, 'flag back on: files readable again';
  raise notice 'ok: audio returns with the right';
end $$;
reset role;
rollback;

begin;
-- admins can add and remove files; nobody else can. The path must stay inside the song's own folder.
update public.songs set audio_path = id::text || '/track.mp3' where id = 'd0000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
set local role authenticated;
do $$ begin
  insert into storage.objects (bucket_id, name) values ('audio', 'd0000000-0000-0000-0000-000000000001/track.mp3');
  assert (select count(*) from storage.objects) = 1, 'admin can add and see a file';
  -- (Removing a file is done through the Storage API; Supabase blocks DELETE statements on its tables.)
  raise notice 'ok: admin manages audio files';
end $$;
select test_helpers.expect_error($q$update public.songs set audio_path = 'd0000000-0000-0000-0000-000000000009/track.mp3' where id = 'd0000000-0000-0000-0000-000000000001'$q$, '23514');
select test_helpers.expect_error($q$update public.songs set audio_path = 'd0000000-0000-0000-0000-000000000001/../x.mp3' where id = 'd0000000-0000-0000-0000-000000000001'$q$, '23514');
rollback;

-- ============================================================ library: adding, ordering, limits
begin;
insert into public.playlists (id, user_id, name) values ('99999999-2222-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'Belongs to user two');
insert into public.playlist_items (id, playlist_id, song_id, position)
  values ('99999999-3333-0000-0000-000000000001', '99999999-2222-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001', 1);
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$
declare
  pl uuid := '99999999-1111-0000-0000-000000000001';
  a uuid; b uuid; c uuid; d uuid;
begin
  insert into public.playlists (id, user_id, name, kind, service_date)
    values (pl, '11111111-1111-1111-1111-111111111111', 'Sunday', 'setlist', '2030-01-06');
  a := public.add_to_playlist(pl, 'd0000000-0000-0000-0000-000000000001');
  b := public.add_to_playlist(pl, 'd0000000-0000-0000-0000-000000000004');
  c := public.add_to_playlist(pl, 'd0000000-0000-0000-0000-000000000001'); -- the same song twice is allowed
  assert (select array_agg("position" order by "position") from public.my_playlist_items(pl)) = array[1, 2, 3], 'positions follow the order added';

  perform public.reorder_playlist(pl, array[c, a, b]);
  assert (select array_agg(item_id order by "position") from public.my_playlist_items(pl)) = array[c, a, b], 'reorder puts the items in the order given';

  update public.playlist_items set key_override = 'F#m' where id = a;
  assert (select key_override from public.my_playlist_items(pl) where item_id = a) = 'F#m', 'a key can be set per item';

  delete from public.playlist_items where id = a;
  d := public.add_to_playlist(pl, 'd0000000-0000-0000-0000-000000000004');
  assert (select "position" from public.my_playlist_items(pl) where item_id = d) = 4, 'the next song goes after the highest position, even after a removal';
  perform public.reorder_playlist(pl, array[d, c, b]);
  assert (select array_agg("position" order by "position") from public.my_playlist_items(pl)) = array[1, 2, 3], 'reorder tidies the numbering';
  raise notice 'ok: add, reorder and remove';
end $$;

select test_helpers.expect_error($q$select public.add_to_playlist('99999999-1111-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002')$q$, '42501'); -- hidden song
select test_helpers.expect_error($q$select public.add_to_playlist('99999999-2222-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001')$q$, 'P0002'); -- someone else's list
select test_helpers.expect_error($q$select public.reorder_playlist('99999999-2222-0000-0000-000000000001', array['99999999-3333-0000-0000-000000000001']::uuid[])$q$, 'P0002');
select test_helpers.expect_error($q$select public.reorder_playlist('99999999-1111-0000-0000-000000000001', array['99999999-3333-0000-0000-000000000001']::uuid[])$q$, '22023'); -- not this list's item, and too few
select test_helpers.expect_error($q$select public.reorder_playlist('99999999-1111-0000-0000-000000000001', (select array_agg(item_id order by "position") || (array_agg(item_id order by "position"))[1] from public.my_playlist_items('99999999-1111-0000-0000-000000000001')))$q$, '22023'); -- one item twice
select test_helpers.expect_error($q$select public.reorder_playlist('99999999-1111-0000-0000-000000000001', (select array_agg(item_id) from (select item_id from public.my_playlist_items('99999999-1111-0000-0000-000000000001') order by "position" limit 2) x))$q$, '22023'); -- an item missing
select test_helpers.expect_error($q$select public.reorder_playlist('99999999-1111-0000-0000-000000000001', (select array[arr[1], arr[1], arr[3]] from (select array_agg(item_id order by "position") as arr from public.my_playlist_items('99999999-1111-0000-0000-000000000001')) q))$q$, '22023'); -- right length, but one item twice and one left out
select test_helpers.expect_error($q$update public.playlist_items set key_override = 'H#' where playlist_id = '99999999-1111-0000-0000-000000000001'$q$, '23514');
select test_helpers.expect_error($q$update public.playlist_items set key_override = 'C7' where playlist_id = '99999999-1111-0000-0000-000000000001'$q$, '23514');
select test_helpers.expect_error($q$insert into public.playlists (user_id, name, kind, service_date) values ('11111111-1111-1111-1111-111111111111', 'x', 'playlist', '2030-01-01')$q$, '23514'); -- a date belongs to a setlist
select test_helpers.expect_error($q$insert into public.playlists (user_id, name) values ('11111111-1111-1111-1111-111111111111', '')$q$, '23514');
reset role;

set local role anon;
select test_helpers.expect_error($q$select public.add_to_playlist('99999999-1111-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001')$q$, '42501');
select test_helpers.expect_error($q$select public.reorder_playlist('99999999-1111-0000-0000-000000000001', array[]::uuid[])$q$, '42501');
reset role;
rollback;

begin;
-- limits: 100 lists per person, 200 songs per list
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  insert into public.playlists (user_id, name) select '11111111-1111-1111-1111-111111111111', 'List ' || g from generate_series(1, 100) g;
  assert (select count(*) from public.playlists) = 100, 'a hundred lists are allowed';
  raise notice 'ok: 100 lists';
end $$;
select test_helpers.expect_error($q$insert into public.playlists (user_id, name) values ('11111111-1111-1111-1111-111111111111', 'One too many')$q$, '54000');
reset role;

select set_config('request.jwt.claim.sub', '22222222-2222-2222-2222-222222222222', true);
set local role authenticated;
do $$
declare pl uuid := '99999999-4444-0000-0000-000000000001';
begin
  insert into public.playlists (id, user_id, name) values (pl, '22222222-2222-2222-2222-222222222222', 'Another person can still make lists');
  insert into public.playlist_items (playlist_id, song_id, position) select pl, 'd0000000-0000-0000-0000-000000000001', g from generate_series(1, 200) g;
  assert (select count(*) from public.playlist_items where playlist_id = pl) = 200, 'two hundred songs are allowed';
  raise notice 'ok: 200 songs; the 100-list limit is per person';
end $$;
select test_helpers.expect_error($q$select public.add_to_playlist('99999999-4444-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000001')$q$, '54000');
reset role;
rollback;

-- ============================================================ admin guards (0009)
begin;
-- Song One is Grace Worship's, on Grace Worship's album. Evening Hymns (c...02) belongs to Shalom Choir.
select test_helpers.expect_error($q$update public.songs set album_id = 'c0000000-0000-0000-0000-000000000002' where id = 'd0000000-0000-0000-0000-000000000001'$q$, '23514');
select test_helpers.expect_error($q$update public.songs set artist_id = 'a0000000-0000-0000-0000-000000000002' where id = 'd0000000-0000-0000-0000-000000000001'$q$, '23514'); -- moving the song away while it keeps Grace's album
select test_helpers.expect_error($q$insert into public.songs (artist_id, album_id, slug, title, language_code) values ('a0000000-0000-0000-0000-000000000001', 'c0000000-0000-0000-0000-000000000002', 'guard-test', 'Guard test', 'ta')$q$, '23514');
do $$ begin
  -- allowed: the song's own album, no album, and moving artist together with a clean album
  update public.songs set album_id = 'c0000000-0000-0000-0000-000000000001' where id = 'd0000000-0000-0000-0000-000000000001';
  update public.songs set album_id = null, artist_id = 'a0000000-0000-0000-0000-000000000002' where id = 'd0000000-0000-0000-0000-000000000001';
  update public.songs set album_id = 'c0000000-0000-0000-0000-000000000002' where id = 'd0000000-0000-0000-0000-000000000001';
  insert into public.songs (artist_id, album_id, slug, title, language_code) values ('a0000000-0000-0000-0000-000000000002', null, 'guard-ok', 'Guard ok', 'ml');
  raise notice 'ok: a song and its album stay with one artist';
end $$;
select test_helpers.expect_error($q$update public.songs set musical_key = 'H' where id = 'd0000000-0000-0000-0000-000000000001'$q$, '23514');
select test_helpers.expect_error($q$update public.songs set musical_key = 'C7' where id = 'd0000000-0000-0000-0000-000000000001'$q$, '23514');
select test_helpers.expect_error($q$update public.songs set musical_key = 'g' where id = 'd0000000-0000-0000-0000-000000000001'$q$, '23514');
do $$ begin
  update public.songs set musical_key = 'F#' where id = 'd0000000-0000-0000-0000-000000000001';
  update public.songs set musical_key = 'Bb' where id = 'd0000000-0000-0000-0000-000000000001';
  update public.songs set musical_key = 'Am' where id = 'd0000000-0000-0000-0000-000000000001';
  update public.songs set musical_key = null where id = 'd0000000-0000-0000-0000-000000000001';
  raise notice 'ok: key names';
end $$;
-- the guard function is not part of the public API
set local role authenticated;
select test_helpers.expect_error($q$select public.guard_song_album()$q$, '42501');
reset role;
rollback;

-- ============================================================ a request that ends stops its posters (0010)
-- Seed: request e...01 (verified, paid, live) has approved posters f...01, f...04, f...06 and a refunded one f...07.
--       request e...02 has approved posters f...02 and f...05.
begin;
update public.posters set status = 'paused' where id = 'f0000000-0000-0000-0000-000000000006'; -- one of them was paused by hand before the refund
update public.requests set status = 'refunded', refund_paise = 9900, refund_reason = 'event cancelled' where id = 'e0000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from public.posters where request_id = 'e0000000-0000-0000-0000-000000000001' and status in ('approved', 'paused')) = 0, 'a refund stops every approved and paused poster of that request';
  assert (select count(*) from public.posters where request_id = 'e0000000-0000-0000-0000-000000000001' and status = 'refunded') = 4, 'they all become refunded, including the paused one';
  assert (select status from public.posters where id = 'f0000000-0000-0000-0000-000000000002') = 'approved', 'another request''s posters are untouched';
  assert (select count(*) from public.audit_log where entity = 'posters' and action = 'UPDATE' and entity_id = 'f0000000-0000-0000-0000-000000000001') >= 1, 'the change is in the audit trail';
end $$;
set local role anon;
do $$ begin
  assert not exists (select 1 from public.home_posters('{ta}', 'IN-TN') where id = 'f0000000-0000-0000-0000-000000000001'), 'and users stop seeing it at once';
  assert exists (select 1 from public.home_posters('{ta}', 'IN-TN') where id = 'f0000000-0000-0000-0000-000000000002'), 'while the others keep showing';
end $$;
reset role;
-- putting the request back does not switch anything back on
update public.requests set status = 'live' where id = 'e0000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from public.posters where request_id = 'e0000000-0000-0000-0000-000000000001' and status = 'approved') = 0, 'un-refunding never re-approves';
  raise notice 'ok: a refund stops the posters';
end $$;
-- a poster cannot be approved under a refunded request
update public.requests set status = 'refunded' where id = 'e0000000-0000-0000-0000-000000000001';
select test_helpers.expect_error($q$update public.posters set status = 'approved' where id = 'f0000000-0000-0000-0000-000000000006'$q$, '23514');
select test_helpers.expect_error($q$insert into public.posters (request_id, kind, title, image_url, status, starts_at, ends_at)
  values ('e0000000-0000-0000-0000-000000000001', 'event', 't', 'https://x.org/p.jpg', 'approved', now(), now() + interval '1 day')$q$, '23514');
rollback;

begin;
update public.requests set status = 'cancelled' where id = 'e0000000-0000-0000-0000-000000000002';
do $$ begin
  assert (select count(*) from public.posters where request_id = 'e0000000-0000-0000-0000-000000000002' and status = 'paused') = 2, 'cancelling pauses its approved posters';
  assert (select status from public.posters where id = 'f0000000-0000-0000-0000-000000000001') = 'approved', 'other requests are untouched';
  raise notice 'ok: cancelling pauses the posters';
end $$;
select test_helpers.expect_error($q$update public.posters set status = 'approved' where id = 'f0000000-0000-0000-0000-000000000002'$q$, '23514');
rollback;

begin;
update public.requests set contact_verified = false where id = 'e0000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from public.posters where request_id = 'e0000000-0000-0000-0000-000000000001' and status = 'approved') = 0, 'an unverified requester pauses its posters';
  assert (select count(*) from public.posters where request_id = 'e0000000-0000-0000-0000-000000000001' and status = 'paused') = 3, 'paused, not refunded';
  assert (select status from public.posters where id = 'f0000000-0000-0000-0000-000000000007') = 'refunded', 'an already refunded poster stays refunded';
end $$;
rollback;

begin;
update public.requests set amount_paise = null where id = 'e0000000-0000-0000-0000-000000000002';
do $$ begin
  assert (select count(*) from public.posters where request_id = 'e0000000-0000-0000-0000-000000000002' and status = 'paused') = 2, 'clearing the amount pauses its posters';
  raise notice 'ok: a request that loses its proof pauses the posters';
end $$;
rollback;

begin;
-- drafts are never switched on or off by this, and unrelated edits to the request change nothing
insert into public.posters (id, request_id, kind, title, image_url, status) values ('f0000000-0000-0000-0000-0000000000d1', 'e0000000-0000-0000-0000-000000000001', 'notice', 'Draft', 'https://x.org/d.jpg', 'draft');
update public.requests set status = 'cancelled' where id = 'e0000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select status from public.posters where id = 'f0000000-0000-0000-0000-0000000000d1') = 'draft', 'a draft stays a draft';
end $$;
rollback;
begin;
update public.requests set notes = 'called back' where id = 'e0000000-0000-0000-0000-000000000001';
do $$ begin
  assert (select count(*) from public.posters where request_id = 'e0000000-0000-0000-0000-000000000001' and status = 'approved') = 3, 'a note changes nothing';
  assert not has_function_privilege('authenticated', 'public.requests_stop_posters()', 'execute'), 'the trigger function is not callable by users';
  assert not has_function_privilege('anon', 'public.requests_stop_posters()', 'execute'), 'nor by visitors';
  raise notice 'ok: drafts, notes and function privileges';
end $$;
rollback;

-- ============================================================ reference lists (0011)
begin;
-- shapes
select test_helpers.expect_error($q$insert into public.languages (code, name) values ('TA', 'Upper')$q$, '23514');
select test_helpers.expect_error($q$insert into public.languages (code, name) values ('x', 'Short')$q$, '23514');
select test_helpers.expect_error($q$insert into public.languages (code, name) values ('abcd', 'Long')$q$, '23514');
select test_helpers.expect_error($q$insert into public.languages (code, name) values ('xx', '   ')$q$, '23514');
select test_helpers.expect_error($q$insert into public.regions (code, name, country_code) values ('in', 'Lower', 'IN')$q$, '23514');
select test_helpers.expect_error($q$insert into public.regions (code, name, country_code) values ('IND', 'Three', 'IND')$q$, '23514');
select test_helpers.expect_error($q$insert into public.regions (code, name, country_code) values ('IN-XX', 'Wrong country', 'LK')$q$, '23514');
select test_helpers.expect_error($q$insert into public.tags (kind, code, label) values ('genre', 'Bad Code', 'x')$q$, '23514');
select test_helpers.expect_error($q$insert into public.tags (kind, code, label) values ('genre', 'ok-code', '')$q$, '23514');
select test_helpers.expect_error($q$insert into public.tags (kind, code, label) values ('colour', 'red', 'Red')$q$, '23514');
do $$ begin
  insert into public.languages (code, name, native_name) values ('xx', 'Testish', null), ('xxx', 'Testish three', 'T');
  insert into public.regions (code, name, country_code) values ('XX', 'Testland', 'XX'), ('XX-A1', 'Testland north', 'XX');
  insert into public.tags (kind, code, label) values ('genre', 'test-genre', 'Test genre'), ('occasion', 'test-occasion', 'Test occasion'), ('mood', 'test-mood', 'Test mood');
  raise notice 'ok: reference shapes';
end $$;
rollback;

begin;
-- codes never change; names do
select test_helpers.expect_error($q$update public.languages set code = 'tx' where code = 'ta'$q$, '23514');
select test_helpers.expect_error($q$update public.regions   set code = 'IN-XX', country_code = 'IN' where code = 'IN-TN'$q$, '23514');
select test_helpers.expect_error($q$update public.tags      set code = 'worship2' where kind = 'genre' and code = 'worship'$q$, '23514');
select test_helpers.expect_error($q$update public.tags      set kind = 'mood' where kind = 'genre' and code = 'worship'$q$, '23514');
do $$ begin
  update public.languages set name = 'Tamil (renamed)', native_name = null where code = 'ta';
  update public.regions   set name = 'Tamil Nadu (renamed)' where code = 'IN-TN';
  update public.tags      set label = 'Worship (renamed)' where kind = 'genre' and code = 'worship';
  assert (select name from public.languages where code = 'ta') = 'Tamil (renamed)';
  raise notice 'ok: codes fixed, names editable';
end $$;
rollback;

begin;
-- nothing in use can be deleted. Seed: Tamil is a song language; Hindi only sits in an artist's language list and a poster target;
-- IN-TN is an artist's region; IN has states; worship is an artist and song genre; sunday-service and peaceful are song tags.
select test_helpers.expect_error($q$delete from public.languages where code = 'ta'$q$, '23503');
select test_helpers.expect_error($q$delete from public.languages where code = 'hi'$q$, '23503');
select test_helpers.expect_error($q$delete from public.regions where code = 'IN-TN'$q$, '23503');
select test_helpers.expect_error($q$delete from public.regions where code = 'IN'$q$, '23503');
select test_helpers.expect_error($q$delete from public.tags where kind = 'genre' and code = 'worship'$q$, '23503');
select test_helpers.expect_error($q$delete from public.tags where kind = 'genre' and code = 'gospel'$q$, '23503');
select test_helpers.expect_error($q$delete from public.tags where kind = 'occasion' and code = 'sunday-service'$q$, '23503');
select test_helpers.expect_error($q$delete from public.tags where kind = 'mood' and code = 'peaceful'$q$, '23503');
do $$ begin
  -- a language that appears only in a poster's target list, a listener's list, or a lyrics version still counts as in use
  insert into public.languages (code, name) values ('xa', 'Only in a poster'), ('xb', 'Only in a profile'), ('xc', 'Only in lyrics'), ('xd', 'Unused');
  insert into public.regions (code, name, country_code) values ('XA', 'Only in a poster', 'XA'), ('XB', 'Unused', 'XB');
  insert into public.posters (kind, title, image_url, match_mode, target_language_codes, target_region_codes)
    values ('notice', 'Ref test', 'https://x.org/r.jpg', 'either', '{xa}', '{XA}');
  update public.profiles set language_codes = '{xb}' where id = '00000000-0000-0000-0000-0000000000aa';
  insert into public.lyrics (song_id, version, language_code, body) values ('d0000000-0000-0000-0000-000000000004', 'romanized', 'xc', 'x');
end $$;
select test_helpers.expect_error($q$delete from public.languages where code = 'xa'$q$, '23503');
select test_helpers.expect_error($q$delete from public.languages where code = 'xb'$q$, '23503');
select test_helpers.expect_error($q$delete from public.languages where code = 'xc'$q$, '23503');
select test_helpers.expect_error($q$delete from public.regions where code = 'XA'$q$, '23503');
do $$
declare msg text;
begin
  -- the message says what still uses it
  begin
    delete from public.tags where kind = 'genre' and code = 'worship';
  exception when others then msg := sqlerrm;
  end;
  assert msg like format('This genre is still in use (artists: %s, songs: %s,%%',
                         (select count(*) from public.artists where 'worship' = any (genres)),
                         (select count(*) from public.songs   where 'worship' = any (genres))),
         'message counts artists and songs, got: ' || coalesce(msg, 'no error');
  assert msg not like '%artists: 0, songs: 0%', 'the counts are not all zero';
  -- the language message counts songs too, so an admin is told the real reason rather than a bare foreign-key error
  msg := null;
  begin
    delete from public.languages where code = 'ta';
  exception when others then msg := sqlerrm;
  end;
  assert msg like format('This language is still in use (artists: %s, songs: %s,%%',
                         (select count(*) from public.artists where 'ta' = any (language_codes)),
                         (select count(*) from (select song_id from public.lyrics where language_code = 'ta' union select id from public.songs where language_code = 'ta') u)),
         'language message counts songs, got: ' || coalesce(msg, 'no error');
  assert msg not like '%songs: 0,%', 'songs are counted';
  -- a song sung in a language with no lyrics written yet still counts
  insert into public.languages (code, name) values ('xe', 'Song only');
  insert into public.songs (artist_id, slug, title, language_code) values ('a0000000-0000-0000-0000-000000000001', 'ref-song-only', 'Ref song only', 'xe');
  msg := null;
  begin
    delete from public.languages where code = 'xe';
  exception when others then msg := sqlerrm;
  end;
  assert msg like 'This language is still in use (artists: 0, songs: 1,%', 'a song without lyrics still counts, got: ' || coalesce(msg, 'no error');
  -- and so does a lyrics version written in it
  msg := null;
  begin
    delete from public.languages where code = 'xc';
  exception when others then msg := sqlerrm;
  end;
  assert msg like 'This language is still in use (artists: 0, songs: 1,%', 'a lyrics version still counts, got: ' || coalesce(msg, 'no error');
  -- and unused values go
  delete from public.languages where code = 'xd';
  delete from public.regions where code = 'XB';
  insert into public.tags (kind, code, label) values ('genre', 'unused-genre', 'Unused');
  delete from public.tags where kind = 'genre' and code = 'unused-genre';
  -- once nothing uses a value any more, it can go
  delete from public.posters where title = 'Ref test';
  delete from public.regions where code = 'XA';
  delete from public.languages where code = 'xa';
  raise notice 'ok: values in use are protected, unused ones can be deleted';
end $$;
rollback;

begin;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
set local role authenticated;
do $$ begin
  -- the guards also hold for a signed-in admin, and the guard functions are not callable
  begin delete from public.languages where code = 'ta'; assert false, 'admin deleted a language in use'; exception when foreign_key_violation then null; end;
  assert not has_function_privilege('authenticated', 'public.guard_reference_delete()', 'execute');
  assert not has_function_privilege('authenticated', 'public.guard_reference_code()', 'execute');
  raise notice 'ok: guards hold for admins';
end $$;
reset role;
rollback;

-- ============================================================ offline copies in the Android app
begin;
-- Off unless the admin ticks it, for every agreement that already exists.
update public.songs set audio_path = id::text || '/track.mp3', audio_mime = 'audio/mpeg', audio_bytes = 1000
 where id in ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000004');
do $$ begin
  assert (select count(*) from public.agreements where allow_offline) = 0, 'no existing agreement allows offline copies';
  assert (select count(*) from public.active_agreements where allow_offline) = 0, 'the view of agreements in force shows the new column too';
  raise notice 'ok: offline copies are off by default';
end $$;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role anon;
select test_helpers.expect_error($q$select * from public.offline_allowed_songs('{}')$q$, '42501');
reset role;
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.v_songs where can_download) = 0, 'nothing can be downloaded until a right is ticked';
  assert (select count(*) from public.offline_allowed_songs(array['d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000004']::uuid[])) = 0, 'no right, no songs';
  assert not has_function_privilege('authenticated', 'public.song_offline_allowed(uuid)', 'execute'), 'the rule itself is private';
  raise notice 'ok: nothing downloadable without the right';
end $$;
reset role;

-- The artist grants it.
update public.agreements set allow_offline = true where id = 'b0000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select can_download from public.v_songs where slug = 'placeholder-song-one') = true, 'song one can be downloaded';
  assert (select can_download from public.v_songs where slug = 'placeholder-single') = true, 'the single can be downloaded';
  assert (select count(*) from public.offline_allowed_songs(array[
           'd0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002',
           'd0000000-0000-0000-0000-000000000003', 'd0000000-0000-0000-0000-000000000004',
           'd0000000-0000-0000-0000-000000000005']::uuid[])) = 2, 'only the two live songs are allowed; the hidden ones and the other artist''s are not';
  assert (select audio_path from public.offline_allowed_songs(array['d0000000-0000-0000-0000-000000000001']::uuid[])) = 'd0000000-0000-0000-0000-000000000001/track.mp3', 'the recording comes with it';
  assert (select count(*) from public.offline_allowed_songs(array[]::uuid[])) = 0, 'an empty list gives an empty answer';
  assert (select count(*) from public.offline_allowed_songs(null)) = 0, 'null gives an empty answer';
  raise notice 'ok: the right opens downloads for live songs only';
end $$;
select test_helpers.expect_error($q$select * from public.offline_allowed_songs((select array_agg(gen_random_uuid()) from generate_series(1, 501)))$q$, '22023');
reset role;

-- The view and the rule are two spellings of one rule: they must never disagree.
do $$ declare bad int; begin
  select count(*) into bad from public.v_songs v where v.can_download <> public.song_offline_allowed(v.id);
  assert bad = 0, 'v_songs.can_download and song_offline_allowed() agree';
end $$;

-- Only the lyrics may be copied: the audio right is off, the offline right stays.
update public.agreements set allow_audio_hosting = false where id = 'b0000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select can_download from public.v_songs where slug = 'placeholder-song-one') = true, 'lyrics alone can still be kept';
  assert (select count(*) from public.offline_allowed_songs(array['d0000000-0000-0000-0000-000000000001']::uuid[])) = 1, 'the song is still allowed';
  assert (select audio_path from public.offline_allowed_songs(array['d0000000-0000-0000-0000-000000000001']::uuid[])) is null, 'but not its recording: the phone deletes the audio and keeps the lyrics';
  raise notice 'ok: the recording needs the audio right as well';
end $$;
reset role;

-- Neither lyrics nor a recording may be shown: there is nothing to keep.
update public.agreements set allow_lyrics = false where id = 'b0000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select can_download from public.v_songs where slug = 'placeholder-song-one') = false, 'nothing to copy: no button';
  assert (select count(*) from public.offline_allowed_songs(array['d0000000-0000-0000-0000-000000000001']::uuid[])) = 0, 'nothing to copy: not allowed';
  raise notice 'ok: no right to anything, no download';
end $$;
reset role;
do $$ declare bad int; begin
  select count(*) into bad from public.v_songs v where v.can_download <> public.song_offline_allowed(v.id);
  assert bad = 0, 'view and rule still agree';
end $$;
rollback;

begin;
-- The agreement ends, is withdrawn, or the song is taken down: the phone is told on its next check, with nothing to clean up here.
update public.songs set audio_path = id::text || '/track.mp3', audio_mime = 'audio/mpeg', audio_bytes = 1000 where id = 'd0000000-0000-0000-0000-000000000001';
update public.agreements set allow_offline = true where id = 'b0000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.offline_allowed_songs(array['d0000000-0000-0000-0000-000000000001']::uuid[])) = 1, 'allowed at first';
end $$;
reset role;

update public.agreements set expires_on = public.app_today() - 1 where id = 'b0000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.offline_allowed_songs(array['d0000000-0000-0000-0000-000000000001']::uuid[])) = 0, 'agreement ended: not allowed';
  raise notice 'ok: copies stop with the agreement';
end $$;
reset role;

update public.agreements set expires_on = public.app_today() + 200 where id = 'b0000000-0000-0000-0000-000000000001';
update public.agreements set status = 'revoked' where id = 'b0000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.offline_allowed_songs(array['d0000000-0000-0000-0000-000000000001']::uuid[])) = 0, 'agreement revoked: not allowed';
  raise notice 'ok: copies stop when the artist withdraws';
end $$;
reset role;
rollback;

begin;
-- A song taken down stops being allowed even though the agreement still allows copies.
update public.agreements set allow_offline = true where id = 'b0000000-0000-0000-0000-000000000001';
update public.songs set is_published = false where id = 'd0000000-0000-0000-0000-000000000001';
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.offline_allowed_songs(array['d0000000-0000-0000-0000-000000000001']::uuid[])) = 0, 'a song that is not live is not allowed';
  raise notice 'ok: copies stop when the song is taken down';
end $$;
reset role;
rollback;

begin;
-- Only an admin changes the flag, and a change is recorded like any other change to an agreement.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ declare n int; begin
  update public.agreements set allow_offline = true;
  get diagnostics n = row_count;
  assert n = 0, 'a normal user cannot change any agreement';
end $$;
reset role;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
set local role authenticated;
do $$ begin
  update public.agreements set allow_offline = true where id = 'b0000000-0000-0000-0000-000000000001';
  assert (select allow_offline from public.agreements where id = 'b0000000-0000-0000-0000-000000000001') = true, 'an admin can tick it';
  raise notice 'ok: only an admin changes the offline right';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.audit_log where entity = 'agreements' and (new_row ->> 'allow_offline') = 'true'), 'the change is in the audit log';
end $$;
rollback;

-- ============================================================ agreements that run until cancelled or revoked
begin;
-- Nothing existing changes.
do $$ begin
  assert (select count(*) from public.agreements where until_revoked) = 0, 'existing agreements are not open-ended';
  assert (select count(*) from public.active_agreements where until_revoked) = 0, 'the view of agreements in force shows the new column too';
  raise notice 'ok: existing agreements keep their dates';
end $$;

-- The rules of the record: a verified agreement needs a start and EITHER an end date OR "until revoked"; an open-ended one has no date.
select test_helpers.expect_error($q$update public.agreements set expires_on = null where id = 'b0000000-0000-0000-0000-000000000001'$q$, '23514');
select test_helpers.expect_error($q$update public.agreements set until_revoked = true where id = 'b0000000-0000-0000-0000-000000000001'$q$, '23514');
select test_helpers.expect_error($q$update public.agreements set until_revoked = true, expires_on = null, starts_on = null where id = 'b0000000-0000-0000-0000-000000000001'$q$, '23514');
select test_helpers.expect_error($q$update public.agreements set until_revoked = true, expires_on = null, document_ref = null where id = 'b0000000-0000-0000-0000-000000000001'$q$, '23514');
-- A draft can be marked open-ended before it is verified, with or without a start date.
insert into public.agreements (id, artist_id, status, until_revoked)
values ('b0000000-0000-0000-0000-000000000003', 'a0000000-0000-0000-0000-000000000002', 'sent', true);
do $$ begin
  assert not exists (select 1 from public.active_agreements where id = 'b0000000-0000-0000-0000-000000000003'), 'a draft is never in force';
  raise notice 'ok: the term rules hold';
end $$;

-- Grace's dated agreement becomes open-ended: still in force, with no end date to count down to.
update public.agreements set until_revoked = true, expires_on = null where id = 'b0000000-0000-0000-0000-000000000001';
do $$ begin
  assert exists (select 1 from public.active_agreements where id = 'b0000000-0000-0000-0000-000000000001'), 'an open-ended agreement is in force';
  assert public.artist_is_available('a0000000-0000-0000-0000-000000000001'), 'the artist stays available';
  assert (select count(*) from public.songs where artist_id = 'a0000000-0000-0000-0000-000000000001' and public.song_is_live(id)) = 2, 'the same songs are live';
  raise notice 'ok: open-ended agreement is in force';
end $$;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select count(*) from public.v_songs where artist_slug = 'grace-worship') = 2, 'users see the artist''s live songs';
  assert (select count(*) from public.v_expiry_watch) = 0, 'users still see no expiry watch';
  raise notice 'ok: users see the songs of an open-ended agreement';
end $$;
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
set local role authenticated;
do $$ begin
  assert (select agreement_open_ended from public.v_admin_artists where slug = 'grace-worship') = true, 'the admin list says open-ended';
  assert (select agreement_expires_on is null and agreement_days_left is null from public.v_admin_artists where slug = 'grace-worship'), 'no date and no days left to show';
  assert (select not agreement_open_ended and agreement_expires_on is null from public.v_admin_artists where slug = 'shalom-choir'), 'the expired artist is not open-ended and has no agreement in force';
  assert (select count(*) from public.v_expiry_watch where kind = 'agreement') = 0, 'an agreement with no end never comes up in the expiry watch';
  raise notice 'ok: admin views show open-ended agreements';
end $$;
reset role;

-- Not started yet, and revoked, are not in force whatever the term.
update public.agreements set starts_on = public.app_today() + 5 where id = 'b0000000-0000-0000-0000-000000000001';
do $$ begin
  assert not public.artist_is_available('a0000000-0000-0000-0000-000000000001'), 'not started yet: not in force';
end $$;
update public.agreements set starts_on = public.app_today() - 30 where id = 'b0000000-0000-0000-0000-000000000001';
update public.agreements set status = 'revoked' where id = 'b0000000-0000-0000-0000-000000000001';
do $$ begin
  assert not public.artist_is_available('a0000000-0000-0000-0000-000000000001'), 'revoked: not in force, however open the term was';
  assert (select count(*) from public.songs where artist_id = 'a0000000-0000-0000-0000-000000000001' and public.song_is_live(id)) = 0, 'the songs go off the site at once';
  raise notice 'ok: not started and revoked agreements are not in force';
end $$;

-- An artist whose dated agreement ran out comes back with an open-ended one, and the open-ended one is the one that counts.
update public.agreements set status = 'verified' where id = 'b0000000-0000-0000-0000-000000000001';
update public.agreements set status = 'verified', document_ref = 'mailbox:msg-0003', verified_by = '00000000-0000-0000-0000-0000000000aa', verified_at = now(),
       starts_on = public.app_today() - 1 where id = 'b0000000-0000-0000-0000-000000000003';
do $$ begin
  assert public.artist_is_available('a0000000-0000-0000-0000-000000000002'), 'an open-ended agreement brings the artist back';
  assert (public.artist_active_agreement('a0000000-0000-0000-0000-000000000002')).id = 'b0000000-0000-0000-0000-000000000003', 'it is the agreement in force';
  raise notice 'ok: a new open-ended agreement replaces an expired one';
end $$;
-- With a dated and an open-ended agreement both in force, the open-ended one is reported.
insert into public.agreements (id, artist_id, status, document_ref, verified_by, verified_at, starts_on, expires_on)
values ('b0000000-0000-0000-0000-000000000004', 'a0000000-0000-0000-0000-000000000002', 'verified', 'mailbox:msg-0004',
        '00000000-0000-0000-0000-0000000000aa', now(), public.app_today() - 1, public.app_today() + 400);
do $$ begin
  assert (public.artist_active_agreement('a0000000-0000-0000-0000-000000000002')).id = 'b0000000-0000-0000-0000-000000000003', 'open-ended comes first';
end $$;
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
set local role authenticated;
do $$ begin
  assert (select agreement_open_ended and agreement_expires_on is null from public.v_admin_artists where slug = 'shalom-choir'), 'the admin list shows open-ended when both are in force';
end $$;
reset role;
-- Revoking the open-ended one leaves the dated one in force.
update public.agreements set status = 'revoked' where id = 'b0000000-0000-0000-0000-000000000003';
select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
set local role authenticated;
do $$ begin
  assert public.artist_is_available('a0000000-0000-0000-0000-000000000002'), 'the dated agreement still holds';
  assert (select not agreement_open_ended and agreement_days_left = 400 from public.v_admin_artists where slug = 'shalom-choir'), 'back to counting days';
  raise notice 'ok: open-ended and dated agreements together';
end $$;
reset role;
rollback;

-- ============================================================ artist YouTube channel, profile picture, first step, contact options (0019)
begin;
-- 1. The artist's channel: youtube.com channel addresses only.
do $$ begin
  update public.artists set youtube_channel_url = 'https://www.youtube.com/@GraceWorship' where slug = 'grace-worship';
  update public.artists set youtube_channel_url = 'https://youtube.com/channel/UCabc_123-x' where slug = 'grace-worship';
  update public.artists set youtube_channel_url = 'https://m.youtube.com/c/GraceWorship/' where slug = 'grace-worship';
  update public.artists set youtube_channel_url = 'https://www.youtube.com/user/graceworship' where slug = 'grace-worship';
  update public.artists set youtube_channel_url = null where slug = 'grace-worship';
  raise notice 'ok: channel addresses accepted';
end $$;
select test_helpers.expect_error($q$update public.artists set youtube_channel_url = 'http://www.youtube.com/@x' where slug = 'grace-worship'$q$, '23514');
select test_helpers.expect_error($q$update public.artists set youtube_channel_url = 'https://evil.example/@x' where slug = 'grace-worship'$q$, '23514');
select test_helpers.expect_error($q$update public.artists set youtube_channel_url = 'https://www.youtube.com.evil.example/@x' where slug = 'grace-worship'$q$, '23514');
select test_helpers.expect_error($q$update public.artists set youtube_channel_url = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ' where slug = 'grace-worship'$q$, '23514');
select test_helpers.expect_error($q$update public.artists set youtube_channel_url = 'https://www.youtube.com/@x?sub_confirmation=1' where slug = 'grace-worship'$q$, '23514');
select test_helpers.expect_error($q$update public.artists set youtube_channel_url = 'https://www.youtube.com/@' where slug = 'grace-worship'$q$, '23514');
select test_helpers.expect_error($q$update public.artists set youtube_channel_url = 'javascript:alert(1)' where slug = 'grace-worship'$q$, '23514');

update public.artists set youtube_channel_url = 'https://www.youtube.com/@GraceWorship' where slug = 'grace-worship';
update public.artists set youtube_channel_url = 'https://www.youtube.com/@ShalomChoir' where slug = 'shalom-choir';
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ begin
  assert (select youtube_channel_url from public.v_artists where slug = 'grace-worship') = 'https://www.youtube.com/@GraceWorship', 'an available artist shows the channel';
  assert (select youtube_channel_url is null from public.v_artists where slug = 'shalom-choir'), 'an unavailable artist shows nothing but the name';
  raise notice 'ok: the channel is shown only while the artist is available';
end $$;
reset role;

-- 2. First step and profile picture.
do $$ begin
  assert (select onboarded_at is null from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'a new account has not done the first step';
  assert (select avatar_url is null from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'and has no picture of its own';
  raise notice 'ok: new accounts start at the first step';
end $$;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ declare n int; begin
  update public.profiles set onboarded_at = now(), language_codes = '{ta}', region_code = 'IN-TN' where id = '11111111-1111-1111-1111-111111111111';
  assert (select onboarded_at is not null and language_codes = '{ta}' and region_code = 'IN-TN' from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'a person finishes the first step on their own row';
  update public.profiles set avatar_url = 'https://abc.supabase.co/storage/v1/object/public/avatars/11111111-1111-1111-1111-111111111111/0f8c.webp' where id = '11111111-1111-1111-1111-111111111111';
  assert (select avatar_url like '%/avatars/11111111-1111-1111-1111-111111111111/0f8c.webp' from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'their own picture is saved';
  update public.profiles set avatar_url = null where id = '11111111-1111-1111-1111-111111111111';
  assert (select avatar_url is null from public.profiles where id = '11111111-1111-1111-1111-111111111111'), 'and can be taken off again';
  update public.profiles set onboarded_at = now() where id = '22222222-2222-2222-2222-222222222222';
  get diagnostics n = row_count;
  assert n = 0, 'nobody changes another person''s profile';
  raise notice 'ok: a person edits only their own first step and picture';
end $$;
select test_helpers.expect_error($q$update public.profiles set avatar_url = 'https://abc.supabase.co/storage/v1/object/public/avatars/22222222-2222-2222-2222-222222222222/a.webp' where id = '11111111-1111-1111-1111-111111111111'$q$, '23514');
select test_helpers.expect_error($q$update public.profiles set avatar_url = 'https://abc.supabase.co/storage/v1/object/public/pictures/artist/a.webp' where id = '11111111-1111-1111-1111-111111111111'$q$, '23514');
select test_helpers.expect_error($q$update public.profiles set avatar_url = 'http://abc.supabase.co/storage/v1/object/public/avatars/11111111-1111-1111-1111-111111111111/a.webp' where id = '11111111-1111-1111-1111-111111111111'$q$, '23514');
select test_helpers.expect_error($q$update public.profiles set avatar_url = 'https://evil.example/photo.png' where id = '11111111-1111-1111-1111-111111111111'$q$, '23514');
select test_helpers.expect_error($q$update public.profiles set avatar_url = 'https://abc.supabase.co/storage/v1/object/public/avatars/11111111-1111-1111-1111-111111111111/a/b.webp' where id = '11111111-1111-1111-1111-111111111111'$q$, '23514');
select test_helpers.expect_error($q$update public.profiles set role = 'admin' where id = '11111111-1111-1111-1111-111111111111'$q$, '42501');
reset role;

-- The avatars bucket: public to read, small, pictures only; each person works in their own folder only.
do $$ begin
  assert (select public and file_size_limit = 524288 and allowed_mime_types = array['image/jpeg', 'image/png', 'image/webp'] from storage.buckets where id = 'avatars'), 'avatars bucket: public, 512 KB, pictures only';
  raise notice 'ok: avatars bucket';
end $$;
insert into storage.objects (bucket_id, name) values ('avatars', '22222222-2222-2222-2222-222222222222/theirs.webp');
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
-- Supabase refuses any direct DELETE on storage.objects (it would leave the real file behind) unless this setting is on. It is set
-- here only so the rule of who may delete a row can be tested; the site deletes through the Storage API.
set local storage.allow_delete_query = 'true';
set local role authenticated;
do $$ declare n int; begin
  insert into storage.objects (bucket_id, name) values ('avatars', '11111111-1111-1111-1111-111111111111/mine.webp');
  assert (select count(*) from storage.objects where bucket_id = 'avatars') = 1, 'a person lists only their own folder';
  update storage.objects set name = '11111111-1111-1111-1111-111111111111/mine2.webp' where name = '11111111-1111-1111-1111-111111111111/mine.webp';
  get diagnostics n = row_count;
  assert n = 1, 'a person replaces their own file';
  delete from storage.objects where bucket_id = 'avatars' and name = '22222222-2222-2222-2222-222222222222/theirs.webp';
  get diagnostics n = row_count;
  assert n = 0, 'nobody deletes another person''s file';
  update storage.objects set name = '11111111-1111-1111-1111-111111111111/stolen.webp' where name = '22222222-2222-2222-2222-222222222222/theirs.webp';
  get diagnostics n = row_count;
  assert n = 0, 'nobody renames another person''s file into their folder';
  delete from storage.objects where bucket_id = 'avatars' and name = '11111111-1111-1111-1111-111111111111/mine2.webp';
  get diagnostics n = row_count;
  assert n = 1, 'a person deletes their own file';
  raise notice 'ok: each person works in their own avatar folder';
end $$;
select test_helpers.expect_error($q$insert into storage.objects (bucket_id, name) values ('avatars', '22222222-2222-2222-2222-222222222222/planted.webp')$q$, '42501');
select test_helpers.expect_error($q$insert into storage.objects (bucket_id, name) values ('avatars', 'loose.webp')$q$, '42501');
select test_helpers.expect_error($q$insert into storage.objects (bucket_id, name) values ('pictures', '11111111-1111-1111-1111-111111111111/x.webp')$q$, '42501');
reset role;
rollback;

begin;
-- 3. Contact options.
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role anon;
select test_helpers.expect_error($q$select * from public.site_contacts$q$, '42501');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
set local role authenticated;
insert into public.site_contacts (kind, label, value, sort_order) values
  ('whatsapp', 'WhatsApp', '919876543210', 1),
  ('email', 'Email', 'hello@example.org', 2),
  ('phone', 'Phone', '+919876543210', 3),
  ('link', 'Instagram', 'https://instagram.com/psalmsplayer', 4);
insert into public.site_contacts (kind, label, value, sort_order, is_active) values ('email', 'Old address', 'old@example.org', 5, false);
select test_helpers.expect_error($q$insert into public.site_contacts (kind, label, value) values ('whatsapp', 'WhatsApp', '+91 98765 43210')$q$, '23514');
select test_helpers.expect_error($q$insert into public.site_contacts (kind, label, value) values ('whatsapp', 'WhatsApp', '1234567')$q$, '23514');
select test_helpers.expect_error($q$insert into public.site_contacts (kind, label, value) values ('whatsapp', 'WhatsApp', 'https://wa.me/919876543210')$q$, '23514');
select test_helpers.expect_error($q$insert into public.site_contacts (kind, label, value) values ('email', 'Email', 'not an email')$q$, '23514');
select test_helpers.expect_error($q$insert into public.site_contacts (kind, label, value) values ('phone', 'Phone', 'call me')$q$, '23514');
select test_helpers.expect_error($q$insert into public.site_contacts (kind, label, value) values ('link', 'Site', 'http://example.org')$q$, '23514');
select test_helpers.expect_error($q$insert into public.site_contacts (kind, label, value) values ('link', 'Site', 'javascript:alert(1)')$q$, '23514');
select test_helpers.expect_error($q$insert into public.site_contacts (kind, label, value) values ('sms', 'Text', '919876543210')$q$, '23514');
select test_helpers.expect_error($q$insert into public.site_contacts (kind, label, value) values ('email', '', 'hello@example.org')$q$, '23514');
do $$ begin
  assert (select count(*) from public.site_contacts) = 5, 'an admin sees every option, hidden ones too';
  raise notice 'ok: an admin adds contact options, each checked for its kind';
end $$;
reset role;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
do $$ declare n int; begin
  assert (select count(*) from public.site_contacts) = 4, 'a signed-in person sees only the options that are on';
  assert (select count(*) from public.site_contacts where label = 'Old address') = 0, 'a hidden option stays hidden';
  update public.site_contacts set value = '911111111111' where kind = 'whatsapp';
  get diagnostics n = row_count;
  assert n = 0, 'a person cannot change an option';
  delete from public.site_contacts;
  get diagnostics n = row_count;
  assert n = 0, 'a person cannot remove an option';
  raise notice 'ok: people read the options that are on and change nothing';
end $$;
select test_helpers.expect_error($q$insert into public.site_contacts (kind, label, value) values ('email', 'Mine', 'me@example.org')$q$, '42501');
reset role;

select set_config('request.jwt.claim.sub', '00000000-0000-0000-0000-0000000000aa', true);
set local role authenticated;
do $$ declare n int; begin
  update public.site_contacts set is_active = false where kind = 'link';
  update public.site_contacts set value = '911111111111' where kind = 'whatsapp';
  get diagnostics n = row_count;
  assert n = 1, 'an admin changes an option';
  delete from public.site_contacts where label = 'Old address';
  get diagnostics n = row_count;
  assert n = 1, 'and removes one';
end $$;
reset role;
do $$ begin
  assert exists (select 1 from public.audit_log where entity = 'site_contacts' and action = 'INSERT'), 'additions are in the audit log';
  assert exists (select 1 from public.audit_log where entity = 'site_contacts' and action = 'UPDATE' and (new_row ->> 'value') = '911111111111'), 'changes are in the audit log';
  assert exists (select 1 from public.audit_log where entity = 'site_contacts' and action = 'DELETE'), 'removals are in the audit log';
  raise notice 'ok: only an admin changes contact options, and it is recorded';
end $$;
rollback;

select 'database tests finished' as result;
