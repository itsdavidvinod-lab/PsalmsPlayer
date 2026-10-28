-- 0016_delete_my_account.sql
-- A signed-in person can delete their own account. Google Play and the App Store both require this inside the app.
-- Deleting the sign-in record removes everything attached to it, because every personal table (profile, likes, playlists and
-- setlists, followed artists, listening records) is tied to it with "on delete cascade".
-- An admin account is refused: administrators are named on agreements and in the audit trail, and the owner should not be able to lock
-- the site out of its only admin by one tap. An admin who really leaves is removed in the SQL editor.

create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public, auth as $$
declare
  me uuid := auth.uid();
begin
  if me is null then
    raise exception 'Sign in first' using errcode = '28000';
  end if;
  if exists (select 1 from public.profiles where id = me and role = 'admin') then
    raise exception 'An admin account cannot be deleted from the app' using errcode = '42501';
  end if;
  delete from auth.users where id = me;
end
$$;

revoke execute on function public.delete_my_account() from public, anon;
grant  execute on function public.delete_my_account() to authenticated;
