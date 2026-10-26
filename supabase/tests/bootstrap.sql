-- bootstrap.sql
-- Stands in for the parts of Supabase that the migrations rely on, so the rules can be tested on plain Postgres.
-- Not used on a real Supabase project.
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create schema auth;
create table auth.users (
  id uuid primary key,
  email text,
  raw_user_meta_data jsonb not null default '{}'::jsonb
);
-- Test sessions set the current user with:  select set_config('request.jwt.claim.sub', '<uuid>', true);
-- This is the same setting the real Supabase auth.uid() reads, so security.test.sql runs unchanged on both.
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
$$;
grant usage on schema auth to anon, authenticated, service_role;
grant execute on function auth.uid() to anon, authenticated, service_role;

grant usage on schema public to anon, authenticated, service_role;
-- Supabase gives anon / authenticated / service_role everything on new public objects by default.
alter default privileges in schema public grant all on tables    to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;

-- Just enough of Supabase Storage for the audio rules: the bucket table and the object table with row-level security.
create schema storage;
create table storage.buckets (
  id                 text primary key,
  name               text not null,
  public             boolean not null default false,
  file_size_limit    bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id          uuid primary key default gen_random_uuid(),
  bucket_id   text references storage.buckets (id),
  name        text,
  owner       uuid,
  created_at  timestamptz not null default now()
);
alter table storage.objects enable row level security;
grant usage on schema storage to anon, authenticated, service_role;
grant all on storage.buckets, storage.objects to anon, authenticated, service_role;
