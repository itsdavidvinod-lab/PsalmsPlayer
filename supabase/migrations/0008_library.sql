-- 0008_library.sql
-- Rules for people's own lists (playlists and setlists): sensible limits, tidy data, and two helpers so the site never has to
-- work out positions itself. Ownership and "only live songs can be added" were already enforced in 0003; nothing here loosens them.

-- ---------------------------------------------------------------- tidy data
alter table public.playlist_items
  add constraint playlist_items_key_format check (key_override is null or key_override ~ '^[A-G][#b]?m?$');
alter table public.playlists
  add constraint playlists_date_only_for_setlists check (kind = 'setlist' or service_date is null);

-- ---------------------------------------------------------------- limits (so nobody can fill the database with lists)
-- 100 lists per person, 200 songs per list. A soft limit: two requests at the same instant could overshoot it by a row or two.
create or replace function public.enforce_library_limits()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_table_name = 'playlists' then
    if (select count(*) from public.playlists where user_id = new.user_id) >= 100 then
      raise exception 'You have reached the limit of 100 lists' using errcode = '54000';
    end if;
  else
    if (select count(*) from public.playlist_items where playlist_id = new.playlist_id) >= 200 then
      raise exception 'This list is full (200 songs)' using errcode = '54000';
    end if;
  end if;
  return new;
end
$$;
revoke execute on function public.enforce_library_limits() from public, anon, authenticated;

create trigger playlists_limit      before insert on public.playlists      for each row execute function public.enforce_library_limits();
create trigger playlist_items_limit before insert on public.playlist_items for each row execute function public.enforce_library_limits();

-- ---------------------------------------------------------------- helpers
-- Runs with the caller's own rights, so the row-level rules apply: only your own list, only live songs.
create or replace function public.add_to_playlist(p_playlist uuid, p_song uuid)
returns uuid
language plpgsql security invoker set search_path = public as $$
declare v_id uuid;
begin
  perform 1 from public.playlists where id = p_playlist and user_id = auth.uid() for update; -- one add at a time per list
  if not found then
    raise exception 'List not found' using errcode = 'P0002';
  end if;
  insert into public.playlist_items (playlist_id, song_id, position)
  select p_playlist, p_song, coalesce(max(position), 0) + 1 from public.playlist_items where playlist_id = p_playlist
  returning id into v_id;
  return v_id;
end
$$;

-- Sets the order of a list in one step. `p_item_ids` must be exactly the list's own items, each once, in the new order.
create or replace function public.reorder_playlist(p_playlist uuid, p_item_ids uuid[])
returns void
language plpgsql security invoker set search_path = public as $$
begin
  perform 1 from public.playlists where id = p_playlist and user_id = auth.uid() for update;
  if not found then
    raise exception 'List not found' using errcode = 'P0002';
  end if;
  if (select count(*) from public.playlist_items where playlist_id = p_playlist) <> coalesce(array_length(p_item_ids, 1), 0)
     or exists (select 1 from unnest(p_item_ids) as u(id) group by u.id having count(*) > 1)
     or exists (select 1 from unnest(p_item_ids) as u(id)
                where not exists (select 1 from public.playlist_items i where i.id = u.id and i.playlist_id = p_playlist))
  then
    raise exception 'The order does not match the list' using errcode = '22023';
  end if;
  update public.playlist_items i
     set position = o.ord::int
    from unnest(p_item_ids) with ordinality as o(id, ord)
   where i.id = o.id and i.playlist_id = p_playlist;
end
$$;

revoke execute on function public.add_to_playlist(uuid, uuid)      from public, anon;
revoke execute on function public.reorder_playlist(uuid, uuid[])   from public, anon;
grant  execute on function public.add_to_playlist(uuid, uuid)      to authenticated;
grant  execute on function public.reorder_playlist(uuid, uuid[])   to authenticated;
