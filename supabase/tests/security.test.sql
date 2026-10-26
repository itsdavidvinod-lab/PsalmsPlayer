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

select 'database tests finished' as result;
