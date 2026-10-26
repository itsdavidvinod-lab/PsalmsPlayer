-- 0002_rules.sql
-- The rules that decide what users can see. Everything fails closed:
-- a missing agreement, a missing consent or a passed expiry date hides the song, with no manual step.

-- "Today" for expiry purposes is today in India. A date means "valid through the end of that day".
create or replace function public.app_today()
returns date language sql stable as $$
  select (now() at time zone 'Asia/Kolkata')::date
$$;

create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select p.role = 'admin' from public.profiles p where p.id = auth.uid()), false)
$$;

-- Agreements in force today. This is the ONE definition of "active". Private: never granted to users.
-- Views that users can read use it through the view owner's rights, so they never need to call a function that returns agreement data.
create view public.active_agreements as
select g.*
from public.agreements g
where g.status = 'verified'
  and g.starts_on <= public.app_today()
  and g.expires_on >= public.app_today();

-- The agreement in force today for an artist (latest expiry wins). All-null row when there is none. Private.
create or replace function public.artist_active_agreement(p_artist uuid)
returns public.agreements language sql stable security definer set search_path = public as $$
  select g.*
  from public.active_agreements g
  where g.artist_id = p_artist
  order by g.expires_on desc
  limit 1
$$;

create or replace function public.artist_is_available(p_artist uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select a.is_published from public.artists a where a.id = p_artist), false)
     and (public.artist_active_agreement(p_artist)).id is not null
$$;

-- Single source of truth for song visibility. Returns 'live' or the first reason it is hidden.
create or replace function public.song_visibility(p_song uuid)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  s public.songs%rowtype;
begin
  select * into s from public.songs where id = p_song;
  if not found then return 'missing'; end if;
  if s.hidden_by_admin then return 'taken_down'; end if;
  if not s.is_published then return 'not_published'; end if;
  if not coalesce((select a.is_published from public.artists a where a.id = s.artist_id), false) then
    return 'artist_not_published';
  end if;
  if (public.artist_active_agreement(s.artist_id)).id is null then return 'agreement_inactive'; end if;
  if not exists (select 1 from public.song_credits c where c.song_id = s.id and c.role = 'writer') then
    return 'no_writer';
  end if;
  if exists (
    select 1 from public.song_credits c
    where c.song_id = s.id and c.role in ('writer', 'owner') and c.consent_status <> 'granted'
  ) then return 'consent_missing'; end if;
  if exists (
    select 1 from public.song_credits c
    where c.song_id = s.id and c.role in ('writer', 'owner')
      and c.consent_expires_on is not null and c.consent_expires_on < public.app_today()
  ) then return 'consent_expired'; end if;
  return 'live';
end
$$;

create or replace function public.song_is_live(p_song uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.song_visibility(p_song) = 'live'
$$;

-- ---------------------------------------------------------------- controlled lists
create or replace function public.validate_catalogue_tags()
returns trigger language plpgsql set search_path = public as $$
declare
  bad text;
begin
  if tg_table_name in ('artists', 'songs') then
    select x into bad from unnest(new.genres) x
      where not exists (select 1 from public.tags t where t.kind = 'genre' and t.code = x) limit 1;
    if bad is not null then raise exception 'Unknown genre: %', bad using errcode = '23514'; end if;
  end if;
  if tg_table_name = 'songs' then
    select x into bad from unnest(new.occasions) x
      where not exists (select 1 from public.tags t where t.kind = 'occasion' and t.code = x) limit 1;
    if bad is not null then raise exception 'Unknown occasion: %', bad using errcode = '23514'; end if;
    select x into bad from unnest(new.moods) x
      where not exists (select 1 from public.tags t where t.kind = 'mood' and t.code = x) limit 1;
    if bad is not null then raise exception 'Unknown mood: %', bad using errcode = '23514'; end if;
  end if;
  if tg_table_name in ('artists', 'profiles') then
    select x into bad from unnest(new.language_codes) x
      where not exists (select 1 from public.languages l where l.code = x) limit 1;
    if bad is not null then raise exception 'Unknown language: %', bad using errcode = '23514'; end if;
  end if;
  return new;
end
$$;

create trigger artists_validate_tags  before insert or update on public.artists
  for each row execute function public.validate_catalogue_tags();
create trigger songs_validate_tags    before insert or update on public.songs
  for each row execute function public.validate_catalogue_tags();
create trigger profiles_validate_tags before insert or update on public.profiles
  for each row execute function public.validate_catalogue_tags();

-- ---------------------------------------------------------------- posters need a verified requester
create or replace function public.guard_poster_approval()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'approved' then
    if new.request_id is null or not exists (
      select 1 from public.requests r
      where r.id = new.request_id and r.contact_verified and r.amount_paise is not null
    ) then
      raise exception 'A poster can only be approved when its request has a verified requester and a recorded amount'
        using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;

create trigger posters_guard_approval before insert or update on public.posters
  for each row execute function public.guard_poster_approval();

create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end
$$;

create trigger requests_touch before update on public.requests
  for each row execute function public.touch_updated_at();
create trigger lyrics_touch before update on public.lyrics
  for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------- audit trail
create or replace function public.log_change()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.audit_log (actor, action, entity, entity_id, old_row, new_row)
  values (
    auth.uid(),
    tg_op,
    tg_table_name,
    coalesce((to_jsonb(new) ->> 'id'), (to_jsonb(old) ->> 'id'))::uuid,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end
  );
  if tg_op = 'DELETE' then return old; end if;
  return new;
end
$$;

create trigger artists_audit      after insert or update or delete on public.artists
  for each row execute function public.log_change();
create trigger agreements_audit   after insert or update or delete on public.agreements
  for each row execute function public.log_change();
create trigger songs_audit        after insert or update or delete on public.songs
  for each row execute function public.log_change();
create trigger song_credits_audit after insert or update or delete on public.song_credits
  for each row execute function public.log_change();
create trigger posters_audit      after insert or update or delete on public.posters
  for each row execute function public.log_change();
create trigger requests_audit     after insert or update or delete on public.requests
  for each row execute function public.log_change();

-- ---------------------------------------------------------------- new users
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'full_name', split_part(new.email, '@', 1)));
  return new;
end
$$;

create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();
