-- 0019_profile_contact_channel.sql
-- Four small things that share one migration:
--   1. An artist can link their YouTube channel (a "Subscribe" link beside Follow on the artist page).
--   2. A person's own profile picture (kept in a new public "avatars" bucket, one folder per person) and the "first sign-in step done"
--      mark that decides who is shown the language and region step right after Google sign-in.
--   3. Contact options the admin manages (WhatsApp, email, phone, a link), shown under Settings > About > Contact us.
-- Additive: nothing existing changes. People who already have an account are marked as done with the first step, so only new
-- accounts are ever shown it.

-- ---------------------------------------------------------------- 1. artist YouTube channel
-- Only channel addresses on youtube.com, so the link can never point anywhere else. The app adds the "ask to subscribe" part itself.
alter table public.artists add column youtube_channel_url text
  check (youtube_channel_url is null
         or (char_length(youtube_channel_url) <= 300
             and youtube_channel_url ~* '^https://(www\.|m\.)?youtube\.com/(@|channel/|c/|user/)[^\s/?#]+/?$'));

-- The public view lists the same artists as before; the channel is shown only while the artist is available, like the photo and bio.
-- It is created again because its inner "a.*" was expanded when it was first created. The new column goes last.
create or replace view public.v_artists as
select
  x.id,
  x.slug,
  x.name,
  x.available,
  case when x.available then x.bio end                  as bio,
  case when x.available then x.photo_url end            as photo_url,
  case when x.available then x.language_codes else '{}' end as language_codes,
  case when x.available then x.region_code end          as region_code,
  case when x.available then x.genres else '{}' end    as genres,
  case when x.available then x.youtube_channel_url end  as youtube_channel_url
from (
  select a.*, public.artist_is_available(a.id) as available
  from public.artists a
  where a.is_published
) x;

-- ---------------------------------------------------------------- 2. profile picture and the first-step mark
alter table public.profiles add column avatar_url text, add column onboarded_at timestamptz;

-- Everyone who exists now has already used the site: they are not sent through the first step.
update public.profiles set onboarded_at = created_at where onboarded_at is null;

-- A person changes these two on their own row; the existing policy (own row only) and the grant (named columns only) still apply,
-- so the role can never be touched.
grant update (avatar_url, onboarded_at) on public.profiles to authenticated;

-- The picture has to be one this person uploaded to their own folder of the avatars bucket (a public address ending in
-- /avatars/<their id>/<file>). Nothing else can be stored in the column.
create or replace function public.profiles_check_avatar()
returns trigger language plpgsql as $$
begin
  if new.avatar_url is not null
     and (char_length(new.avatar_url) > 500
          or new.avatar_url !~ ('^https://[^/\s]+/storage/v1/object/public/avatars/' || new.id::text || '/[^/\s?#]+$')) then
    raise exception 'The profile picture must be one you uploaded here' using errcode = '23514';
  end if;
  return new;
end
$$;
revoke execute on function public.profiles_check_avatar() from public, anon, authenticated;
create trigger profiles_check_avatar before insert or update of avatar_url on public.profiles
  for each row execute function public.profiles_check_avatar();

-- The bucket is public for reading (a picture is shown by its address), small, and picture types only. Files are named
-- <person id>/<random id>.<ext>, so an address cannot be guessed. Each person can add, replace, list and delete only their own folder.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 524288, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_own_folder on storage.objects for all to authenticated
  using      (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text)
  with check (bucket_id = 'avatars' and split_part(name, '/', 1) = auth.uid()::text);

-- ---------------------------------------------------------------- 3. contact options
-- Each row is one way to reach the owner. The admin adds, edits, hides and removes them; everyone signed in sees the ones that are on.
--   whatsapp: the number with its country code and nothing else (919876543210); the app turns it into https://wa.me/<number>
--   email:    an address;  phone: digits, with an optional leading +;  link: an https address
create table public.site_contacts (
  id         uuid primary key default gen_random_uuid(),
  kind       text not null check (kind in ('whatsapp', 'email', 'phone', 'link')),
  label      text not null check (char_length(label) between 1 and 60),
  value      text not null check (char_length(value) between 1 and 300),
  sort_order int  not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  constraint contact_value_fits_kind check (
       (kind = 'whatsapp' and value ~ '^[0-9]{8,15}$')
    or (kind = 'email'    and value ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')
    or (kind = 'phone'    and value ~ '^\+?[0-9]{6,15}$')
    or (kind = 'link'     and value ~ '^https://[^\s]+$'))
);
alter table public.site_contacts enable row level security;

-- New tables are open to everyone by default on Supabase; take it all back, then allow exactly what the site does.
revoke all on public.site_contacts from anon, authenticated;
grant select, insert, update, delete on public.site_contacts to authenticated;
create policy site_contacts_read on public.site_contacts for select to authenticated
  using (is_active or public.is_admin());
create policy site_contacts_admin_write on public.site_contacts for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create trigger site_contacts_audit after insert or update or delete on public.site_contacts
  for each row execute function public.log_change();
