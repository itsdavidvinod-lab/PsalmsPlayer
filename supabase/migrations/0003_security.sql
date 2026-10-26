-- 0003_security.sql
-- Row-level security. Default stance: nobody reads anything.
--   * Public catalogue data reaches users only through the views and functions in 0004.
--   * Admin tables (agreements, requests, posters, lyrics, raw songs ...) are readable by admins only.
--   * Users own their likes, playlists and profile.

alter table public.languages      enable row level security;
alter table public.regions        enable row level security;
alter table public.tags           enable row level security;
alter table public.profiles       enable row level security;
alter table public.artists        enable row level security;
alter table public.agreements     enable row level security;
alter table public.albums         enable row level security;
alter table public.songs          enable row level security;
alter table public.song_credits   enable row level security;
alter table public.lyrics         enable row level security;
alter table public.requests       enable row level security;
alter table public.posters        enable row level security;
alter table public.song_likes     enable row level security;
alter table public.playlists      enable row level security;
alter table public.playlist_items enable row level security;
alter table public.play_events    enable row level security;
alter table public.audit_log      enable row level security;

-- Start from nothing, then grant back only what is needed.
revoke all on all tables    in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;

-- ---------------------------------------------------------------- reference data
grant select on public.languages, public.regions, public.tags to anon, authenticated;
create policy reference_read_languages on public.languages for select using (true);
create policy reference_read_regions   on public.regions   for select using (true);
create policy reference_read_tags      on public.tags      for select using (true);
create policy reference_write_languages on public.languages for all using (public.is_admin()) with check (public.is_admin());
create policy reference_write_regions   on public.regions   for all using (public.is_admin()) with check (public.is_admin());
create policy reference_write_tags      on public.tags      for all using (public.is_admin()) with check (public.is_admin());
grant insert, update, delete on public.languages, public.regions, public.tags to authenticated;

-- ---------------------------------------------------------------- profiles
-- Users can read and edit their own profile, but never the role column.
grant select on public.profiles to authenticated;
grant update (display_name, language_codes, region_code) on public.profiles to authenticated;
create policy profiles_read   on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy profiles_update on public.profiles for update using (id = auth.uid()) with check (id = auth.uid());

-- ---------------------------------------------------------------- admin-only tables
-- Granting the table privilege to "authenticated" is safe: the policy below still requires is_admin().
do $$
declare
  t text;
begin
  foreach t in array array['artists', 'agreements', 'albums', 'songs', 'song_credits', 'lyrics', 'requests', 'posters']
  loop
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format(
      'create policy %I on public.%I for all using (public.is_admin()) with check (public.is_admin())',
      t || '_admin_all', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------- audit log: admin can read, nobody can write
grant select on public.audit_log to authenticated;
create policy audit_log_admin_read on public.audit_log for select using (public.is_admin());

-- ---------------------------------------------------------------- user-owned data
grant select, insert, delete on public.song_likes to authenticated;
create policy likes_owner_read   on public.song_likes for select using (user_id = auth.uid());
create policy likes_owner_delete on public.song_likes for delete using (user_id = auth.uid());
create policy likes_owner_insert on public.song_likes for insert
  with check (user_id = auth.uid() and public.song_is_live(song_id));

grant select, insert, update, delete on public.playlists to authenticated;
create policy playlists_owner on public.playlists for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());

grant select, insert, update, delete on public.playlist_items to authenticated;
create policy playlist_items_owner_read on public.playlist_items for select
  using (exists (select 1 from public.playlists p where p.id = playlist_id and p.user_id = auth.uid()));
create policy playlist_items_owner_change on public.playlist_items for update
  using (exists (select 1 from public.playlists p where p.id = playlist_id and p.user_id = auth.uid()))
  with check (exists (select 1 from public.playlists p where p.id = playlist_id and p.user_id = auth.uid()));
create policy playlist_items_owner_delete on public.playlist_items for delete
  using (exists (select 1 from public.playlists p where p.id = playlist_id and p.user_id = auth.uid()));
create policy playlist_items_owner_insert on public.playlist_items for insert
  with check (
    exists (select 1 from public.playlists p where p.id = playlist_id and p.user_id = auth.uid())
    and public.song_is_live(song_id)
  );

-- play_events: no direct access for users. record_play() is the only door.
create policy play_events_admin_read on public.play_events for select using (public.is_admin());
grant select on public.play_events to authenticated;

-- ---------------------------------------------------------------- helper functions are not public API
-- (Supabase grants EXECUTE on new functions to anon and authenticated by default; take it back.)
revoke execute on function public.song_visibility(uuid)           from public, anon, authenticated;
revoke execute on function public.artist_active_agreement(uuid)   from public, anon, authenticated;
revoke execute on function public.log_change()                    from public, anon, authenticated;
revoke execute on function public.handle_new_user()               from public, anon, authenticated;
revoke execute on function public.guard_poster_approval()         from public, anon, authenticated;
revoke execute on function public.validate_catalogue_tags()       from public, anon, authenticated;
-- Policies and views call these as the signed-in (or anonymous) user, so they must stay executable.
-- They return only a boolean or a date, nothing about agreement terms.
grant execute on function public.is_admin()                  to anon, authenticated;
grant execute on function public.song_is_live(uuid)          to anon, authenticated;
grant execute on function public.artist_is_available(uuid)   to anon, authenticated;
grant execute on function public.app_today()                 to anon, authenticated;
