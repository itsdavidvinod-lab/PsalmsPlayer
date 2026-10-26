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
