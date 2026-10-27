-- A song shows its album's cover, when it has an album that is published. A single without an album keeps the coloured placeholder.
-- The new column is added at the end, so everything that reads v_songs (and the functions that return its rows) keeps working.
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
  al.cover_url as cover_url
from public.songs s
join public.artists a on a.id = s.artist_id
left join public.albums al on al.id = s.album_id and al.is_published
where public.song_is_live(s.id);
