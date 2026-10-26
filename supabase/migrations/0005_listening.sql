-- 0005_listening.sql
-- Real listening time. A "listener" is a signed-in person who actually played a song for at least 30 seconds.
-- Monthly listeners and trending are built from this, not from page opens.
--
-- How the number is kept honest. The site reports play time from the YouTube player (playing, not muted, not paused);
-- the database does not trust the report. For every report it:
--   * credits at most the real time since that person's last report on ANY of their sessions, so several tabs or
--     scripts running in parallel cannot add up to more than the clock allows;
--   * credits at most 20 seconds per report (the site reports every 15 seconds);
--   * stops crediting after 8 hours in one day (India time);
--   * limits how many sessions one person can start per hour;
--   * ignores admins when counting listeners.
-- A script that waits in real time, on many real accounts, can still inflate numbers. Confirmed emails and a CAPTCHA on
-- sign-up (Supabase settings) are the defence against that, not this table.

create table public.listen_sessions (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles (id) on delete cascade,
  song_id      uuid not null references public.songs (id) on delete cascade,
  started_at   timestamptz not null default now(),
  last_beat_at timestamptz not null default now(),
  listened_s   int not null default 0 check (listened_s between 0 and 86400),
  qualified_at timestamptz   -- set the first time listened_s reaches 30
);
create index listen_sessions_user_beat_idx      on public.listen_sessions (user_id, last_beat_at desc);
create index listen_sessions_song_qualified_idx on public.listen_sessions (song_id, qualified_at) where qualified_at is not null;

alter table public.listen_sessions enable row level security;
revoke all on public.listen_sessions from anon, authenticated;
create policy listen_sessions_admin_read on public.listen_sessions for select using (public.is_admin());
grant select on public.listen_sessions to authenticated;

comment on table public.play_events is
  'Lyrics opens only (kind = lyrics_open) in practice. Not used for listener counts. Trending uses it only as a tie-break.';

-- ---------------------------------------------------------------- the one door for listening time
-- p_session null: start a session (credits nothing; it only starts the clock).
-- p_session set: report p_seconds of play since the last report. Returns no row for a hidden song or when over the limits.
create or replace function public.record_listen(p_session uuid, p_song uuid, p_seconds int)
returns table (session_id uuid, total_s int, qualified boolean)
language plpgsql security definer set search_path = public as $$
declare
  uid     uuid := auth.uid();
  s       public.listen_sessions;
  prev    timestamptz;
  elapsed numeric;
  today_s int;
  credit  int;
begin
  if uid is null then
    raise exception 'Log in to listen' using errcode = '28000';
  end if;
  if not public.song_is_live(p_song) then
    return;
  end if;

  -- One report at a time per person. Without this, several requests sent at the same instant would each see the same
  -- "last report" time and each be credited the full gap.
  perform pg_advisory_xact_lock(hashtextextended('listen:' || uid::text, 0));

  -- latest report on any of this person's sessions (the clock that every session shares)
  select max(l.last_beat_at) into prev from public.listen_sessions l where l.user_id = uid;

  if p_session is not null then
    select * into s from public.listen_sessions l
     where l.id = p_session and l.user_id = uid and l.song_id = p_song
     for update;
  end if;

  if s.id is null then
    -- new session; someone else's session id, or another song's, ends up here too
    if (select count(*) from public.listen_sessions l
         where l.user_id = uid and l.started_at > now() - interval '1 hour') >= 120 then
      return;
    end if;
    insert into public.listen_sessions (user_id, song_id) values (uid, p_song) returning * into s;
    return query select s.id, 0, false;
    return;
  end if;

  elapsed := extract(epoch from (now() - prev));
  credit  := greatest(0, least(coalesce(p_seconds, 0), 20, floor(elapsed)::int + 1));

  select coalesce(sum(l.listened_s), 0) into today_s
    from public.listen_sessions l
   where l.user_id = uid
     and (l.started_at at time zone 'Asia/Kolkata')::date = public.app_today();
  credit := greatest(0, least(credit, 28800 - today_s));

  update public.listen_sessions l
     set last_beat_at = now(),
         listened_s   = l.listened_s + credit,
         qualified_at = coalesce(l.qualified_at, case when l.listened_s + credit >= 30 then now() end)
   where l.id = s.id
   returning * into s;

  return query select s.id, s.listened_s, (s.qualified_at is not null);
end
$$;
revoke execute on function public.record_listen(uuid, uuid, int) from public, anon;
grant  execute on function public.record_listen(uuid, uuid, int) to authenticated;

-- ---------------------------------------------------------------- numbers built from listening time
-- Distinct signed-in people (not admins) who listened to a song by this artist for 30+ seconds in the last 30 days.
-- Null below the minimum so tiny numbers are not shown, and null for an unavailable artist.
create or replace function public.artist_monthly_listeners(p_artist uuid, p_min int default 10)
returns int language sql stable security definer set search_path = public as $$
  select case when n >= p_min then n end
  from (
    select count(distinct l.user_id)::int as n
    from public.listen_sessions l
    join public.songs s    on s.id = l.song_id
    join public.profiles p on p.id = l.user_id
    where s.artist_id = p_artist
      and l.qualified_at > now() - interval '30 days'
      and p.role <> 'admin'
      and public.artist_is_available(p_artist)
  ) x
$$;

-- Trending: most distinct listeners (30+ seconds) in the last 7 days, then most lyric opens, then newest.
create or replace function public.trending_songs(
  p_languages text[] default '{}', p_region text default null, p_limit int default 20
)
returns setof public.v_songs
language sql stable security definer set search_path = public as $$
  select s.*
  from public.v_songs s
  left join (
    select l.song_id, count(distinct l.user_id) as n
    from public.listen_sessions l
    join public.profiles p on p.id = l.user_id
    where l.qualified_at > now() - interval '7 days' and p.role <> 'admin'
    group by l.song_id
  ) heard on heard.song_id = s.id
  left join (
    select e.song_id, count(*) as n
    from public.play_events e
    where e.kind = 'lyrics_open' and e.created_at > now() - interval '7 days'
    group by e.song_id
  ) opened on opened.song_id = s.id
  where (cardinality(coalesce(p_languages, '{}')) = 0 or s.language_code = any (p_languages))
    and (p_region is null or exists (
          select 1 from public.artists a
          where a.id = s.artist_id
            and split_part(a.region_code, '-', 1) = split_part(p_region, '-', 1)))
  order by coalesce(heard.n, 0) desc, coalesce(opened.n, 0) desc, s.published_at desc nulls last
  limit greatest(least(coalesce(p_limit, 20), 100), 1)
$$;
