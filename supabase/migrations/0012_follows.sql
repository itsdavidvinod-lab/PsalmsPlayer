-- 0012_follows.sql
-- Following artists. A private list: only its owner can see or change it, and only an artist who is published and whose
-- agreement is in force can be newly followed (an artist who becomes unavailable stays in the list, as a name only).

create table public.artist_follows (
  user_id    uuid not null references public.profiles (id) on delete cascade,
  artist_id  uuid not null references public.artists (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, artist_id)
);
create index artist_follows_artist_idx on public.artist_follows (artist_id);
alter table public.artist_follows enable row level security;

-- New tables are open to everyone by default on Supabase; take it all back, then allow exactly what the site does.
revoke all on public.artist_follows from anon, authenticated;
grant select, insert, delete on public.artist_follows to authenticated;
create policy follows_owner_read   on public.artist_follows for select using (user_id = auth.uid());
create policy follows_owner_delete on public.artist_follows for delete using (user_id = auth.uid());
create policy follows_owner_insert on public.artist_follows for insert
  with check (user_id = auth.uid() and exists (select 1 from public.v_artists a where a.id = artist_id and a.available));

-- A soft limit of 500 followed artists per person, so nobody can fill the table. Two requests at the same instant could
-- overshoot it by a row or two.
create or replace function public.enforce_follow_limit()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.artist_follows where user_id = new.user_id) >= 500 then
    raise exception 'You have reached the limit of 500 followed artists' using errcode = '54000';
  end if;
  return new;
end
$$;
revoke execute on function public.enforce_follow_limit() from public, anon, authenticated;
create trigger artist_follows_limit before insert on public.artist_follows for each row execute function public.enforce_follow_limit();

-- The artists a person follows, newest first, as the same rows the artist lists show. An artist who has become
-- unavailable still appears, with `available = false` and nothing but a name.
create or replace function public.my_followed_artists()
returns setof public.v_artists
language sql stable security definer set search_path = public as $$
  select a.*
  from public.artist_follows f join public.v_artists a on a.id = f.artist_id
  where f.user_id = auth.uid()
  order by f.created_at desc
$$;
revoke execute on function public.my_followed_artists() from public, anon;
grant  execute on function public.my_followed_artists() to authenticated;
