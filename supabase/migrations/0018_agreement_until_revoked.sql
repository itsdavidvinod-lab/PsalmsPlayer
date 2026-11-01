-- 0018_agreement_until_revoked.sql
-- An agreement can run "until cancelled or revoked": no end date. It stays in force until the admin sets it to Revoked (which the
-- admin does when the artist writes to take it back). Until now every verified agreement needed an end date.
--
-- The no-end-date case is its own yes/no column rather than an empty end date, so that "the admin forgot the date" and "there is no
-- date" can never be mistaken for each other: a verified agreement needs a start date and EITHER an end date OR until_revoked.
--
-- Songs need no change here: a credit's consent_expires_on has always been optional, and empty already means "no end".
-- Nothing existing changes: every row keeps until_revoked = false and its dates.

alter table public.agreements add column until_revoked boolean not null default false;

-- An open-ended agreement has no end date.
alter table public.agreements add constraint agreement_open_has_no_end check (not until_revoked or expires_on is null);

-- A verified agreement still needs proof and a start; the end is either a date or "until revoked".
alter table public.agreements drop constraint agreement_verified_needs_proof;
alter table public.agreements add constraint agreement_verified_needs_proof check (
  status <> 'verified'
  or (document_ref is not null and verified_by is not null and verified_at is not null
      and starts_on is not null and (expires_on is not null or until_revoked))
);

-- The ONE definition of "in force". It is built from the table's columns when created, so it is created again to show the new one
-- (last, in the same place as in the table, which is what artist_active_agreement() needs: it returns agreements).
create or replace view public.active_agreements as
select g.*
from public.agreements g
where g.status = 'verified'
  and g.starts_on <= public.app_today()
  and (g.until_revoked or g.expires_on >= public.app_today());

-- The agreement in force today for an artist: an open-ended one first, otherwise the one that ends last.
create or replace function public.artist_active_agreement(p_artist uuid)
returns public.agreements language sql stable security definer set search_path = public as $$
  select g.*
  from public.active_agreements g
  where g.artist_id = p_artist
  order by g.until_revoked desc, g.expires_on desc
  limit 1
$$;

-- Same columns as 0004; agreement_open_ended is added at the end. When an open-ended agreement is in force there is no end date and no
-- count of days to show, so those two stay empty.
create or replace view public.v_admin_artists as
select a.id, a.slug, a.name, a.is_published, public.artist_is_available(a.id) as available,
       case when g.open_ended then null else g.expires_on end as agreement_expires_on,
       case when g.open_ended then null else (g.expires_on - public.app_today()) end as agreement_days_left,
       (select count(*) from public.songs s where s.artist_id = a.id)::int as song_count,
       (select count(*) from public.songs s where s.artist_id = a.id and public.song_is_live(s.id))::int as live_song_count,
       coalesce(g.open_ended, false) as agreement_open_ended
from public.artists a
left join lateral (
  select max(ag.expires_on) as expires_on, bool_or(ag.until_revoked) as open_ended
  from public.active_agreements ag where ag.artist_id = a.id
) g on true
where public.is_admin();
