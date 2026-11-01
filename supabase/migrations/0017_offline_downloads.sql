-- 0017_offline_downloads.sql
-- Offline copies in the Android app. Keeping a song's recording and lyrics on a phone is a right the artist grants separately:
-- agreements.allow_offline (off unless the admin ticks it). It is NOT filled in for agreements that already exist: each one has
-- to be ticked on purpose, so nothing becomes downloadable by accident.
--
-- What the flag does:
--   * v_songs gets can_download, so the app shows a Download button only where it is allowed.
--   * offline_allowed_songs() is the one door the app uses to start a download and to check, whenever it is online, that the copies it
--     holds are still allowed. A song that is no longer allowed (agreement ended, revoked, flag unticked, song taken down) is
--     missing from its answer, and the app deletes its copy.
--   * Lyrics keep their own rules: get_lyrics() still decides whether lyrics, chords and translations may be shown.
--
-- Same shape as allow_audio_hosting in 0007: checked on every request, nothing to clean up on the server when an agreement ends.

alter table public.agreements add column allow_offline boolean not null default false;

-- A view written as "select g.*" keeps the columns it had when it was created, so it has to be created again to show the new one.
-- The new column goes last, in the same place as in the table, which is what artist_active_agreement() (returns agreements) needs.
create or replace view public.active_agreements as
select g.*
from public.agreements g
where g.status = 'verified'
  and g.starts_on <= public.app_today()
  and g.expires_on >= public.app_today();

-- One definition of "a copy of this song may be kept on a phone right now": the song is live, and an agreement in force allows offline
-- copies AND allows something to copy (the lyrics, or a hosted recording).
create or replace function public.song_offline_allowed(p_song uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.song_is_live(p_song)
     and exists (
       select 1
       from public.songs s
       join public.active_agreements g on g.artist_id = s.artist_id
       where s.id = p_song
         and g.allow_offline
         and (g.allow_lyrics or (s.audio_path is not null and g.allow_audio_hosting)))
$$;
revoke execute on function public.song_offline_allowed(uuid) from public, anon, authenticated;

-- Same columns as 0014; only can_download is added, at the end. (The view already lists live songs only.) The test in security.test.sql
-- keeps the expression below and song_offline_allowed() in step.
create or replace view public.v_songs as
select
  s.id, s.slug, s.title, s.language_code, s.musical_key, s.tempo_bpm, s.duration_s, s.track_no,
  s.genres, s.occasions, s.moods, s.published_at,
  a.id as artist_id, a.slug as artist_slug, a.name as artist_name,
  al.id as album_id, al.slug as album_slug, al.title as album_title,
  case when s.youtube_status in ('ok', 'not_embeddable') then s.youtube_id end as youtube_id,
  (select count(*) from public.song_likes l where l.song_id = s.id)::int as like_count,
  (s.audio_path is not null
   and exists (select 1 from public.active_agreements g where g.artist_id = s.artist_id and g.allow_audio_hosting)) as has_audio,
  coalesce(s.cover_url, al.cover_url) as cover_url,
  exists (select 1 from public.active_agreements g
          where g.artist_id = s.artist_id and g.allow_offline
            and (g.allow_lyrics or (s.audio_path is not null and g.allow_audio_hosting))) as can_download
from public.songs s
join public.artists a on a.id = s.artist_id
left join public.albums al on al.id = s.album_id and al.is_published
where public.song_is_live(s.id);

-- Of the songs a phone holds, the ones it may still hold. One row per allowed song, with the path of its recording when the recording
-- may be copied too (null when only the lyrics may). A song that is not in the answer must be deleted from the phone.
-- The app asks in small groups; the cap only stops one call from being used to scan the whole catalogue.
create or replace function public.offline_allowed_songs(p_songs uuid[])
returns table (song_id uuid, audio_path text)
language plpgsql stable security definer set search_path = public as $$
begin
  if auth.uid() is null then
    raise exception 'Log in to keep songs offline' using errcode = '28000';
  end if;
  if coalesce(cardinality(p_songs), 0) > 500 then
    raise exception 'Too many songs in one request' using errcode = '22023';
  end if;
  return query
  select s.id,
         case when public.song_audio_allowed(s.id) then s.audio_path end
  from public.songs s
  where s.id = any (coalesce(p_songs, '{}'))
    and public.song_offline_allowed(s.id);
end
$$;
revoke execute on function public.offline_allowed_songs(uuid[]) from public, anon;
grant  execute on function public.offline_allowed_songs(uuid[]) to authenticated;
