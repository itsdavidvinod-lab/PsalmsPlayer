-- 0010_request_stops_posters.sql
-- A poster is on Home because a request was agreed, verified and paid. If that request is later refunded or cancelled, or loses its
-- verified requester or its recorded amount, its posters must stop at once instead of running on until their end date.
--   * refunded      -> the request's approved and paused posters become 'refunded'
--   * cancelled, contact no longer verified, amount cleared -> its approved posters become 'paused'
-- Putting a request back to normal does NOT switch anything back on: an admin approves the poster again on purpose.
-- Also: a poster cannot be approved under a request that is already refunded or cancelled.

create or replace function public.requests_stop_posters()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.status = 'refunded' then
    update public.posters set status = 'refunded' where request_id = new.id and status in ('approved', 'paused');
  elsif new.status = 'cancelled' or not new.contact_verified or new.amount_paise is null then
    update public.posters set status = 'paused' where request_id = new.id and status = 'approved';
  end if;
  return new;
end
$$;
revoke execute on function public.requests_stop_posters() from public, anon, authenticated;

create trigger requests_stop_posters after update of status, contact_verified, amount_paise on public.requests
  for each row execute function public.requests_stop_posters();

create or replace function public.guard_poster_approval()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.status = 'approved' then
    if new.request_id is null or not exists (
      select 1 from public.requests r
      where r.id = new.request_id and r.contact_verified and r.amount_paise is not null
        and r.status not in ('refunded', 'cancelled')
    ) then
      raise exception 'A poster can only be approved when its request has a verified requester and a recorded amount, and is not refunded or cancelled'
        using errcode = '23514';
    end if;
  end if;
  return new;
end
$$;
