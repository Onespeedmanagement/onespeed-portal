-- "View as": lets an admin see the portal exactly as another user does.
-- The portal sends an x-view-as header; it only counts when the signed-in person
-- is an active admin, and only for reading (read-only transactions). Any write
-- while viewing runs as nobody, so the database refuses it.
-- Safe to run more than once.

create or replace function me() returns text
language sql stable security definer set search_path = public as $$
  with real as (select lower(coalesce(auth.jwt() ->> 'email', '')) as email),
       hdr  as (select lower(nullif(nullif(current_setting('request.headers', true), '')::json ->> 'x-view-as', '')) as email)
  select case
    when hdr.email is null then real.email
    when not exists (select 1 from app_users a where a.email = real.email and a.role = 'admin' and a.active) then real.email
    when current_setting('transaction_read_only', true) = 'on' then hdr.email
    else ''                                  -- viewing as someone: no writes
  end
  from real, hdr
$$;
