-- 0006_audio.sql
-- Songs can carry an audio file that the site streams, and a YouTube link that opens the YouTube app.
--
--   * The file lives in a PRIVATE storage bucket called "audio", at  <song id>/<file name>.
--   * Nobody can list or read the bucket directly. A signed-in user may read a file only while its song is live
--     (same rule as lyrics: artist available, consent in date, not taken down). The check runs on every request.
--   * The site asks song_audio_path() for the path and then asks Storage for a short-lived signed link.
--     A link that was already handed out keeps working until it expires (an hour), then stops.
--   * Only admins can upload or remove files.
--   * The YouTube link is just a link out (no embedding), so it needs only an admin-checked link.

alter table public.songs
  add column audio_path  text,
  add column audio_mime  text,
  add column audio_bytes bigint,
  add constraint songs_audio_path_in_song_folder
    check (audio_path is null or (audio_path like id::text || '/%' and audio_path !~ '\.\.' and length(audio_path) <= 300)),
  add constraint songs_audio_bytes_positive check (audio_bytes is null or audio_bytes > 0);

-- ---------------------------------------------------------------- what users may see about a song
-- Appends has_audio (the path itself is never exposed) and relaxes the YouTube rule: a link-out needs an admin-checked
-- link, not permission to embed.
create or replace view public.v_songs as
select
  s.id, s.slug, s.title, s.language_code, s.musical_key, s.tempo_bpm, s.duration_s, s.track_no,
  s.genres, s.occasions, s.moods, s.published_at,
  a.id as artist_id, a.slug as artist_slug, a.name as artist_name,
  al.id as album_id, al.slug as album_slug, al.title as album_title,
  case when s.youtube_status in ('ok', 'not_embeddable') then s.youtube_id end as youtube_id,
  (select count(*) from public.song_likes l where l.song_id = s.id)::int as like_count,
  (s.audio_path is not null) as has_audio
from public.songs s
join public.artists a on a.id = s.artist_id
left join public.albums al on al.id = s.album_id and al.is_published
where public.song_is_live(s.id);

-- ---------------------------------------------------------------- the door the player uses
create or replace function public.song_audio_path(p_song uuid)
returns text
language plpgsql stable security definer set search_path = public as $$
declare p text;
begin
  if auth.uid() is null then
    raise exception 'Log in to listen' using errcode = '28000';
  end if;
  if not public.song_is_live(p_song) then return null; end if;
  select s.audio_path into p from public.songs s where s.id = p_song;
  return p;
end
$$;
revoke execute on function public.song_audio_path(uuid) from public, anon;
grant  execute on function public.song_audio_path(uuid) to authenticated;

-- Used by the storage policy below. Runs with the owner's rights because users cannot read the songs table.
create or replace function public.audio_object_is_streamable(p_name text)
returns boolean
language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from public.songs s where s.audio_path = p_name and public.song_is_live(s.id))
$$;
revoke execute on function public.audio_object_is_streamable(text) from public, anon;
grant  execute on function public.audio_object_is_streamable(text) to authenticated;

-- ---------------------------------------------------------------- private bucket and its rules
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio', 'audio', false, 104857600,   -- 100 MB per file (a hosted plan's own upload limit can be lower)
  array['audio/mpeg', 'audio/mp4', 'audio/x-m4a', 'audio/aac', 'audio/wav', 'audio/x-wav', 'audio/wave',
        'audio/ogg', 'audio/opus', 'audio/flac', 'audio/x-flac', 'audio/webm']
)
on conflict (id) do update
  set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy audio_admin_all on storage.objects for all to authenticated
  using      (bucket_id = 'audio' and public.is_admin())
  with check (bucket_id = 'audio' and public.is_admin());

create policy audio_stream_live_songs on storage.objects for select to authenticated
  using (bucket_id = 'audio' and public.audio_object_is_streamable(name));
