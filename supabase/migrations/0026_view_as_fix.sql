-- "View as" fix: honor the x-view-as header for admins on every request.
-- (The portal itself refuses all changes while viewing, so no write ever runs this way.)
create or replace function me() returns text
language sql stable security definer set search_path = public as $$
  with real as (select lower(coalesce(auth.jwt() ->> 'email', '')) as email),
       hdr  as (select lower(nullif(nullif(current_setting('request.headers', true), '')::json ->> 'x-view-as', '')) as email)
  select case
    when hdr.email is null then real.email
    when exists (select 1 from app_users a where a.email = real.email and a.role = 'admin' and a.active) then hdr.email
    else real.email
  end
  from real, hdr
$$;
