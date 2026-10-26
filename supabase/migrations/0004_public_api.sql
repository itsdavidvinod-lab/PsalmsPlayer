-- 0004_public_api.sql
-- What the website and apps are allowed to call.
-- Views are SECURITY DEFINER on purpose: they read tables that users cannot read directly,
-- and every one filters by the visibility rules, so the filter IS the security boundary.

-- ---------------------------------------------------------------- artists
-- Unavailable artists keep a name and a placeholder, nothing else.
create view public.v_artists as
select
  x.id,
  x.slug,
  x.name,
  x.available,
  case when x.available then x.bio end                  as bio,
  case when x.available then x.photo_url end            as photo_url,
  case when x.available then x.language_codes else '{}' end as language_codes,
  case when x.available then x.region_code end          as region_code,
  case when x.available then x.genres else '{}' end    as genres
from (
  select a.*, public.artist_is_available(a.id) as available
  from public.artists a
  where a.is_published
) x;

create view public.v_albums as
select
  al.id, al.slug, al.title, al.kind, al.release_year, al.cover_url,
  a.id as artist_id, a.slug as artist_slug, a.name as artist_name
from public.albums al
join public.artists a on a.id = al.artist_id
where al.is_published
  and public.artist_is_available(a.id);

-- Only live songs. youtube_id is withheld unless the agreement allows embedding and the link passed its check.
create view public.v_songs as
select
  s.id, s.slug, s.title, s.language_code, s.musical_key, s.tempo_bpm, s.duration_s, s.track_no,
  s.genres, s.occasions, s.moods, s.published_at,
  a.id as artist_id, a.slug as artist_slug, a.name as artist_name,
  al.id as album_id, al.slug as album_slug, al.title as album_title,
  case when s.youtube_status = 'ok'
        and exists (select 1 from public.active_agreements g where g.artist_id = s.artist_id and g.allow_video_embed)
       then s.youtube_id end as youtube_id,
  (select count(*) from public.song_likes l where l.song_id = s.id)::int as like_count
from public.songs s
join public.artists a on a.id = s.artist_id
left join public.albums al on al.id = s.album_id and al.is_published
where public.song_is_live(s.id);

-- Views get ALL privileges by default on Supabase. Take everything back, then allow reading only.
revoke all on public.v_artists, public.v_albums, public.v_songs from anon, authenticated;
grant select on public.v_artists, public.v_albums, public.v_songs to anon, authenticated;

-- ---------------------------------------------------------------- lyrics (login required)
-- Chords are removed unless the agreement allows chords. Romanized / meaning only if it allows translations.
create or replace function public.get_lyrics(p_song uuid)
returns table (version text, language_code text, body text, has_chords boolean)
language plpgsql stable security definer set search_path = public as $$
declare
  g public.agreements;
  artist uuid;
begin
  if auth.uid() is null then
    raise exception 'Log in to read lyrics' using errcode = '28000';
  end if;
  if not public.song_is_live(p_song) then return; end if;

  select artist_id into artist from public.songs where id = p_song;
  g := public.artist_active_agreement(artist);
  if not coalesce(g.allow_lyrics, false) then return; end if;

  return query
  select l.version,
         l.language_code,
         case when g.allow_chords then l.body else regexp_replace(l.body, '\[[^\]]*\]', '', 'g') end,
         (g.allow_chords and l.body ~ '\[[^\]]+\]')
  from public.lyrics l
  where l.song_id = p_song
    and (l.version = 'original' or coalesce(g.allow_translations, false))
  order by case l.version when 'original' then 0 when 'romanized' then 1 else 2 end;
end
$$;
revoke execute on function public.get_lyrics(uuid) from public, anon;
grant  execute on function public.get_lyrics(uuid) to authenticated;

-- ---------------------------------------------------------------- posters on Home
-- Returns only what a user may see. No start, end or price. Enforced on every call, no cron needed.
create or replace function public.home_posters(
  p_languages text[] default '{}',
  p_region    text   default null,
  p_limit     int    default 6
)
returns table (id uuid, kind text, title text, image_url text, youtube_id text, event_date date, match_rank int)
language sql stable security definer set search_path = public as $$
  with cand as (
    select p.*,
           (p.target_language_codes && coalesce(p_languages, '{}')) as lang_hit,
           exists (
             select 1 from unnest(p.target_region_codes) t
             where p_region is not null and (t = p_region or t = split_part(p_region, '-', 1))
           ) as region_hit
    from public.posters p
    where p.status = 'approved'
      and now() >= p.starts_at
      and now() <  least(p.ends_at, ((p.event_date + 1)::timestamp at time zone 'Asia/Kolkata'))
  )
  select c.id, c.kind, c.title, c.image_url, c.youtube_id, c.event_date,
         case when c.lang_hit and c.region_hit then 3
              when c.lang_hit or c.region_hit  then 2
              else 1 end as match_rank
  from cand c
  where c.match_mode = 'everyone'
     or (c.match_mode = 'both'   and c.lang_hit and c.region_hit)
     or (c.match_mode = 'either' and (c.lang_hit or c.region_hit))
  order by match_rank desc, c.starts_at desc
  limit greatest(least(coalesce(p_limit, 6), 12), 1)
$$;
grant execute on function public.home_posters(text[], text, int) to anon, authenticated;

-- ---------------------------------------------------------------- discovery lists
create or replace function public.trending_songs(
  p_languages text[] default '{}', p_region text default null, p_limit int default 20
)
returns setof public.v_songs
language sql stable security definer set search_path = public as $$
  select s.*
  from public.v_songs s
  left join (
    select e.song_id, count(*) as n
    from public.play_events e
    where e.created_at > now() - interval '7 days'
    group by e.song_id
  ) recent on recent.song_id = s.id
  where (cardinality(coalesce(p_languages, '{}')) = 0 or s.language_code = any (p_languages))
    and (p_region is null or exists (
          select 1 from public.artists a
          where a.id = s.artist_id
            and split_part(a.region_code, '-', 1) = split_part(p_region, '-', 1)))
  order by coalesce(recent.n, 0) desc, s.published_at desc nulls last
  limit greatest(least(coalesce(p_limit, 20), 100), 1)
$$;

create or replace function public.most_liked_songs(
  p_languages text[] default '{}', p_region text default null, p_limit int default 20
)
returns setof public.v_songs
language sql stable security definer set search_path = public as $$
  select s.*
  from public.v_songs s
  where (cardinality(coalesce(p_languages, '{}')) = 0 or s.language_code = any (p_languages))
    and (p_region is null or exists (
          select 1 from public.artists a
          where a.id = s.artist_id
            and split_part(a.region_code, '-', 1) = split_part(p_region, '-', 1)))
  order by s.like_count desc, s.published_at desc nulls last
  limit greatest(least(coalesce(p_limit, 20), 100), 1)
$$;

-- Rule-based to start: same artist or shared genres as songs the user liked. Falls back to most liked.
create or replace function public.suggested_songs(p_limit int default 20)
returns setof public.v_songs
language sql stable security definer set search_path = public as $$
  with liked as (
    select s.artist_id, s.genres
    from public.song_likes l join public.v_songs s on s.id = l.song_id
    where l.user_id = auth.uid()
  ),
  fav_artists as (select distinct artist_id from liked),
  fav_genres  as (select distinct g from liked, unnest(liked.genres) g)
  select s.*
  from public.v_songs s
  where auth.uid() is not null
    and not exists (select 1 from public.song_likes l where l.user_id = auth.uid() and l.song_id = s.id)
  order by (case when s.artist_id in (select artist_id from fav_artists) then 2 else 0 end)
         + (select count(*) from unnest(s.genres) g where g in (select g from fav_genres)) desc,
           s.like_count desc,
           s.published_at desc nulls last
  limit greatest(least(coalesce(p_limit, 20), 100), 1)
$$;

grant execute on function public.trending_songs(text[], text, int)   to anon, authenticated;
grant execute on function public.most_liked_songs(text[], text, int) to anon, authenticated;
revoke execute on function public.suggested_songs(int) from public, anon;
grant  execute on function public.suggested_songs(int) to authenticated;

-- ---------------------------------------------------------------- listening data
create or replace function public.record_play(p_song uuid, p_kind text default 'play')
returns void language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or p_kind not in ('play', 'lyrics_open') then return; end if;
  if not public.song_is_live(p_song) then return; end if;
  -- one event per user, song and kind per 30 minutes
  if exists (
    select 1 from public.play_events e
    where e.user_id = auth.uid() and e.song_id = p_song and e.kind = p_kind
      and e.created_at > now() - interval '30 minutes'
  ) then return; end if;
  insert into public.play_events (user_id, song_id, kind) values (auth.uid(), p_song, p_kind);
end
$$;
revoke execute on function public.record_play(uuid, text) from public, anon;
grant  execute on function public.record_play(uuid, text) to authenticated;

-- Distinct signed-in users who played or opened a song by this artist in the last 30 days, counted in the app.
-- Plays inside the YouTube embed are not visible to us. Null below the minimum so tiny numbers are not shown.
create or replace function public.artist_monthly_listeners(p_artist uuid, p_min int default 10)
returns int language sql stable security definer set search_path = public as $$
  select case when n >= p_min then n end
  from (
    select count(distinct e.user_id)::int as n
    from public.play_events e
    join public.songs s on s.id = e.song_id
    where s.artist_id = p_artist
      and e.created_at > now() - interval '30 days'
      and public.artist_is_available(p_artist)
  ) x
$$;
grant execute on function public.artist_monthly_listeners(uuid, int) to anon, authenticated;

-- ---------------------------------------------------------------- the user's own lists
create or replace function public.my_liked_songs()
returns setof public.v_songs
language sql stable security definer set search_path = public as $$
  select s.*
  from public.song_likes l join public.v_songs s on s.id = l.song_id
  where l.user_id = auth.uid()
  order by l.created_at desc
$$;

-- Hidden songs stay in the list as an unavailable slot: position kept, no title, no artist.
create or replace function public.my_playlist_items(p_playlist uuid)
returns table (
  item_id uuid, "position" int, key_override text, available boolean,
  song_id uuid, slug text, title text, artist_name text, musical_key text
)
language sql stable security definer set search_path = public as $$
  select i.id, i.position, i.key_override, (s.id is not null),
         s.id, s.slug, s.title, s.artist_name, s.musical_key
  from public.playlist_items i
  join public.playlists p on p.id = i.playlist_id and p.user_id = auth.uid()
  left join public.v_songs s on s.id = i.song_id
  where i.playlist_id = p_playlist
  order by i.position
$$;

revoke execute on function public.my_liked_songs()            from public, anon;
revoke execute on function public.my_playlist_items(uuid)     from public, anon;
grant  execute on function public.my_liked_songs()            to authenticated;
grant  execute on function public.my_playlist_items(uuid)     to authenticated;

-- ---------------------------------------------------------------- admin views
-- Security definer views that return rows only to admins.
-- The reason a song is hidden is admin-only information, so it goes through a gated wrapper.
create or replace function public.admin_song_visibility(p_song uuid)
returns text language sql stable security definer set search_path = public as $$
  select case when public.is_admin() then public.song_visibility(p_song) end
$$;
revoke execute on function public.admin_song_visibility(uuid) from public, anon;
grant  execute on function public.admin_song_visibility(uuid) to authenticated;

create view public.v_admin_songs as
select s.id, s.slug, s.title, s.artist_id, a.name as artist_name, s.album_id, s.is_published, s.hidden_by_admin,
       public.admin_song_visibility(s.id) as visibility,
       s.youtube_id, s.youtube_status, s.youtube_checked_at,
       (select count(*) from public.song_credits c where c.song_id = s.id and c.role in ('writer', 'owner'))::int as consent_people,
       (select count(*) from public.song_credits c where c.song_id = s.id and c.role in ('writer', 'owner')
          and c.consent_status = 'granted')::int as consent_granted
from public.songs s
join public.artists a on a.id = s.artist_id
where public.is_admin();

create view public.v_admin_artists as
select a.id, a.slug, a.name, a.is_published, public.artist_is_available(a.id) as available,
       g.expires_on as agreement_expires_on,
       (g.expires_on - public.app_today()) as agreement_days_left,
       (select count(*) from public.songs s where s.artist_id = a.id)::int as song_count,
       (select count(*) from public.songs s where s.artist_id = a.id and public.song_is_live(s.id))::int as live_song_count
from public.artists a
left join lateral (
  select max(ag.expires_on) as expires_on from public.active_agreements ag where ag.artist_id = a.id
) g on true
where public.is_admin();

-- Everything that stops working within 60 days. Feeds the reminder emails to artists and admins.
create view public.v_expiry_watch as
select 'agreement'::text as kind, ag.artist_id, ar.name as artist_name, null::uuid as song_id, null::text as song_title,
       null::text as person_name, ag.expires_on, (ag.expires_on - public.app_today()) as days_left
from public.agreements ag join public.artists ar on ar.id = ag.artist_id
where ag.status = 'verified' and ag.expires_on between public.app_today() and public.app_today() + 60
  and public.is_admin()
union all
select 'consent', so.artist_id, ar.name, so.id, so.title, c.person_name, c.consent_expires_on,
       (c.consent_expires_on - public.app_today())
from public.song_credits c
join public.songs so on so.id = c.song_id
join public.artists ar on ar.id = so.artist_id
where c.role in ('writer', 'owner') and c.consent_status = 'granted'
  and c.consent_expires_on between public.app_today() and public.app_today() + 60
  and public.is_admin();

revoke all on public.v_admin_songs, public.v_admin_artists, public.v_expiry_watch from anon, authenticated;
grant select on public.v_admin_songs, public.v_admin_artists, public.v_expiry_watch to authenticated;
