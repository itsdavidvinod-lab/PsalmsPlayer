-- 0015_pictures_bucket.sql
-- Pictures an admin uploads (artist photos, album and song covers, posters). The bucket is PUBLIC for reading: a picture is
-- shown to people by its address, like any picture on a website, and the files are named with random ids so nobody can guess one.
-- Nobody can list the bucket. Only admins can add, replace or delete files. The browser shrinks every picture before it is
-- uploaded; the 2 MB limit and the image-only types are the database-side backstop.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('pictures', 'pictures', true, 2097152, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy pictures_admin_all on storage.objects for all to authenticated
  using      (bucket_id = 'pictures' and public.is_admin())
  with check (bucket_id = 'pictures' and public.is_admin());
