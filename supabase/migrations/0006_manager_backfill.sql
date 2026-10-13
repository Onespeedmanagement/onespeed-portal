-- Managers can upload their store's POS reports back to a start date
-- (setting manager_backfill_from), sales only: close-outs keep the normal
-- catch-up window. A day can be uploaded once; after that only an admin
-- (or the nightly email) can replace it.

insert into settings values ('manager_backfill_from', '"2026-10-01"') on conflict (key) do nothing;

create or replace function backfill_from() returns date
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::date from settings where key = 'manager_backfill_from'), current_date)
$$;

-- May this manager upload a report for this store and day right now?
create or replace function manager_upload_ok(b uuid, d date) returns boolean
language sql stable security definer set search_path = public as $$
  select is_manager_of(b)
     and d < (select (now() at time zone bz.timezone)::date from businesses bz where bz.id = b)
     and (manager_date_ok(b, d) or d >= backfill_from())
     and not exists (select 1 from pos_daily p where p.business_id = b and p.business_date = d)
$$;

-- Days from the start date to yesterday, and whether each has its report
create or replace function manager_report_days(b uuid)
returns table (business_date date, has_report boolean)
language sql stable security definer set search_path = public as $$
  select d::date, exists (select 1 from pos_daily p where p.business_id = b and p.business_date = d::date)
  from businesses bz,
       generate_series(least(backfill_from(), (now() at time zone bz.timezone)::date - catchup_days()),
                       (now() at time zone bz.timezone)::date - 1, interval '1 day') d
  where bz.id = b and is_manager_of(b)
  order by 1
$$;

-- No department rows saved yet for that day (sees past row security)
create or replace function dept_day_empty(b uuid, d date) returns boolean
language sql stable security definer set search_path = public as $$
  select not exists (select 1 from pos_departments x where x.business_id = b and x.business_date = d)
$$;

drop policy if exists pos_files_manager_add on pos_files;
drop policy if exists pos_manager_add       on pos_daily;
drop policy if exists pos_manager_update    on pos_daily;   -- no replacing a day once it's in
drop policy if exists dept_manager_add      on pos_departments;
drop policy if exists dept_manager_delete   on pos_departments;

create policy pos_files_manager_add on pos_files for insert
  with check (source = 'upload' and manager_upload_ok(business_id, business_date));
create policy pos_manager_add on pos_daily for insert
  with check (manager_upload_ok(business_id, business_date));
create policy dept_manager_add on pos_departments for insert
  with check (is_manager_of(business_id)
              and business_date >= least(backfill_from(), (now() at time zone 'America/New_York')::date - catchup_days())
              and dept_day_empty(business_id, business_date));
