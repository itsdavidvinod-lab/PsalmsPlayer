-- 0007_audio_rights.sql
-- Hosting a recording is a right the artist grants separately: agreements.allow_audio_hosting (off unless the admin ticks it).
-- 0006 let any LIVE song stream its file. From here a song's file is playable only while the song is live AND an agreement
-- in force for its artist allows audio hosting. Lyrics are unaffected: a song whose agreement lacks the flag simply shows as
-- lyrics-only. Same shape as allow_video_embed in 0004: checked on every request, nothing to clean up when an agreement ends.

-- One definition of "this song's file may be played right now". Used by the catalogue view, the path lookup and the storage rule.
create or replace function public.song_audio_allowed(p_song uuid)
returns boolean
language sql stable security definer set search_path = public as $$
  select public.song_is_live(p_song)
     and exists (
       select 1
       from public.songs s
       join public.active_agreements g on g.artist_id = s.artist_id
       where s.id = p_song and g.allow_audio_hosting)
$$;
revoke execute on function public.song_audio_allowed(uuid) from public, anon, authenticated;

-- Same columns as 0006; only has_audio changes. (The view already lists live songs only.)
create or replace view public.v_songs as
select
  s.id, s.slug, s.title, s.language_code, s.musical_key, s.tempo_bpm, s.duration_s, s.track_no,
  s.genres, s.occasions, s.moods, s.published_at,
  a.id as artist_id, a.slug as artist_slug, a.name as artist_name,
  al.id as album_id, al.slug as album_slug, al.title as album_title,
  case when s.youtube_status in ('ok', 'not_embeddable') then s.youtube_id end as youtube_id,
  (select count(*) from public.song_likes l where l.song_id = s.id)::int as like_count,
  (s.audio_path is not null
   and exists (select 1 from public.active_agreements g where g.artist_id = s.artist_id and g.allow_audio_hosting)) as has_audio
from public.songs s
join public.artists a on a.id = s.artist_id
left join public.albums al on al.id = s.album_id and al.is_published
where public.song_is_live(s.id);

create or replace function public.song_audio_path(p_song uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare p text;
begin
  if auth.uid() is null then
    raise exception 'Log in to listen' using errcode = '28000';
  end if;
  if not public.song_audio_allowed(p_song) then return null; end if;
  select s.audio_path into p from public.songs s where s.id = p_song;
  return p;
end
$$;

create or replace function public.audio_object_is_streamable(p_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from public.songs s where s.audio_path = p_name and public.song_audio_allowed(s.id))
$$;
