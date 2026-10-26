-- 0011_reference_guards.sql
-- The admin site lets an admin add and rename languages, regions, genres, occasions and moods. These rules keep that safe, in the database,
-- because the lists are referenced from many places by code (arrays included, which no foreign key can protect):
--   * codes have a fixed shape and can never be changed (a changed code would silently orphan every record that uses it)
--   * a value that is still in use cannot be deleted (it would leave artists, songs, listeners or posters pointing at nothing)
--   * a region's country is the first part of its code, so "IN-TN" always belongs to "IN"

alter table public.languages
  add constraint languages_code_format check (code ~ '^[a-z]{2,3}$'),
  add constraint languages_name_filled check (btrim(name) <> '' and length(name) <= 80 and (native_name is null or length(native_name) <= 80));

alter table public.regions
  add constraint regions_code_format check (code ~ '^[A-Z]{2}(-[A-Z0-9]{1,3})?$'),
  add constraint regions_country_matches_code check (country_code = split_part(code, '-', 1)),
  add constraint regions_name_filled check (btrim(name) <> '' and length(name) <= 80);

alter table public.tags
  add constraint tags_code_format check (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and length(code) <= 40),
  add constraint tags_label_filled check (btrim(label) <> '' and length(label) <= 80);

-- ---------------------------------------------------------------- codes never change
create or replace function public.guard_reference_code()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'tags' then
    if new.code is distinct from old.code or new.kind is distinct from old.kind then
      raise exception 'A code cannot be changed. Add a new one, move the records over, then delete the old one' using errcode = '23514';
    end if;
  elsif new.code is distinct from old.code then
    raise exception 'A code cannot be changed. Add a new one, move the records over, then delete the old one' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke execute on function public.guard_reference_code() from public, anon, authenticated;

create trigger languages_guard_code before update on public.languages for each row execute function public.guard_reference_code();
create trigger regions_guard_code   before update on public.regions   for each row execute function public.guard_reference_code();
create trigger tags_guard_code      before update on public.tags      for each row execute function public.guard_reference_code();

-- ---------------------------------------------------------------- nothing in use is deleted
-- Runs as the admin who deletes (admins can read artists, songs, posters and listeners' settings, so the counts are complete).
create or replace function public.guard_reference_delete()
returns trigger language plpgsql set search_path = public as $$
declare
  n_artists int := 0;
  n_songs   int := 0;
  n_people  int := 0;
  n_posters int := 0;
  n_states  int := 0;
  what      text;
begin
  if tg_table_name = 'languages' then
    what := 'language';
    select count(*) into n_artists from public.artists  where old.code = any (language_codes);
    -- songs sung in it, or with a lyrics version written in it
    select count(*) into n_songs   from (select song_id from public.lyrics where language_code = old.code union select id from public.songs where language_code = old.code) u;
    select count(*) into n_people  from public.profiles where old.code = any (language_codes);
    select count(*) into n_posters from public.posters  where old.code = any (target_language_codes);
  elsif tg_table_name = 'regions' then
    what := 'region';
    select count(*) into n_artists from public.artists  where region_code = old.code;
    select count(*) into n_people  from public.profiles where region_code = old.code;
    select count(*) into n_posters from public.posters  where old.code = any (target_region_codes);
    select count(*) into n_states  from public.regions  where country_code = old.code and code <> old.code;
  else
    what := old.kind;
    if old.kind = 'genre' then
      select count(*) into n_artists from public.artists where old.code = any (genres);
      select count(*) into n_songs   from public.songs   where old.code = any (genres);
    elsif old.kind = 'occasion' then
      select count(*) into n_songs   from public.songs   where old.code = any (occasions);
    else
      select count(*) into n_songs   from public.songs   where old.code = any (moods);
    end if;
  end if;

  if n_artists + n_songs + n_people + n_posters + n_states > 0 then
    raise exception 'This % is still in use (artists: %, songs: %, listeners: %, posters: %, regions inside it: %). Remove it from them first',
      what, n_artists, n_songs, n_people, n_posters, n_states using errcode = '23503';
  end if;
  return old;
end
$$;
revoke execute on function public.guard_reference_delete() from public, anon, authenticated;

create trigger languages_guard_delete before delete on public.languages for each row execute function public.guard_reference_delete();
create trigger regions_guard_delete   before delete on public.regions   for each row execute function public.guard_reference_delete();
create trigger tags_guard_delete      before delete on public.tags      for each row execute function public.guard_reference_delete();
