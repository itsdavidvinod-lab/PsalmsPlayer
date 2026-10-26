-- 0009_admin_guards.sql
-- Rules the admin site relies on, enforced by the database so no screen, script or mistake can break them.
--   * A song's album must belong to the song's artist. (Otherwise a song could be shown on another artist's album.)
--   * A song's musical key is a key name as the key picker writes it: C, F#, Bb, Am, ... (the same shape as a setlist's key).

alter table public.songs
  add constraint songs_musical_key_format check (musical_key is null or musical_key ~ '^[A-G][#b]?m?$');

create or replace function public.guard_song_album()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.album_id is not null and not exists (
    select 1 from public.albums a where a.id = new.album_id and a.artist_id = new.artist_id
  ) then
    raise exception 'The album does not belong to the same artist as the song' using errcode = '23514';
  end if;
  return new;
end
$$;

create trigger songs_guard_album before insert or update of album_id, artist_id on public.songs
  for each row execute function public.guard_song_album();

revoke execute on function public.guard_song_album() from public, anon, authenticated;
