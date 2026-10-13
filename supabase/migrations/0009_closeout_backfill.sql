-- Let managers also do cash close-outs for the catch-up days since the start
-- date (manager_backfill_from, Oct 1), not just the last 7 days. The catch-up
-- turns itself off after manager_backfill_until (default Oct 31); after that
-- only the normal 7-day window applies. Safe to run more than once.

insert into settings values ('manager_backfill_until', '"2026-10-31"') on conflict (key) do nothing;

create or replace function backfill_from() returns date
language sql stable security definer set search_path = public as $$
  select case
    when (now() at time zone 'America/New_York')::date
         <= coalesce((select (value #>> '{}')::date from settings where key = 'manager_backfill_until'), '9999-12-31'::date)
    then coalesce((select (value #>> '{}')::date from settings where key = 'manager_backfill_from'),
                  (now() at time zone 'America/New_York')::date)
    else (now() at time zone 'America/New_York')::date
  end
$$;

-- First day a manager can work on: the earlier of the catch-up start date and 7 days ago
create or replace function manager_window_start() returns date
language sql stable security definer set search_path = public as $$
  select least(backfill_from(), (now() at time zone 'America/New_York')::date - catchup_days())
$$;

create or replace function manager_date_ok(b uuid, d date) returns boolean
language sql stable security definer set search_path = public as $$
  with t as (select (now() at time zone bz.timezone)::date as today from businesses bz where bz.id = b)
  select coalesce((
    select d = t.today - 1
        or (d between least(backfill_from(), t.today - catchup_days()) and t.today - 1
            and not exists (select 1 from closeouts c where c.business_id = b and c.business_date = d))
    from t), false)
$$;

create or replace function manager_open_dates(b uuid) returns setof date
language sql stable security definer set search_path = public as $$
  select d::date from businesses bz,
    generate_series(least(backfill_from(), (now() at time zone bz.timezone)::date - catchup_days()),
                    (now() at time zone bz.timezone)::date - 1, interval '1 day') d
  where bz.id = b and is_manager_of(b) and manager_date_ok(b, d::date)
  order by d
$$;

-- Managers can still see what they submitted anywhere in that window
drop policy if exists pos_manager      on pos_daily;
drop policy if exists co_manager_read  on closeouts;
drop policy if exists coe_manager_read on closeout_employees;
drop policy if exists coe_manager_add  on closeout_employees;

create policy pos_manager on pos_daily for select
  using (is_manager_of(business_id) and (manager_date_ok(business_id, business_date)
         or exists (select 1 from closeouts c where c.business_id = pos_daily.business_id
                    and c.business_date = pos_daily.business_date and c.submitted_by = me()
                    and c.business_date >= manager_window_start())));
create policy co_manager_read on closeouts for select
  using (is_manager_of(business_id) and (manager_date_ok(business_id, business_date)
         or (submitted_by = me() and business_date >= manager_window_start())));
create policy coe_manager_read on closeout_employees for select
  using (exists (select 1 from closeouts c where c.id = closeout_id
                 and is_manager_of(c.business_id) and (manager_date_ok(c.business_id, c.business_date)
                      or (c.submitted_by = me() and c.business_date >= manager_window_start()))));
create policy coe_manager_add on closeout_employees for insert
  with check (exists (select 1 from closeouts c where c.id = closeout_id
                      and is_manager_of(c.business_id) and c.submitted_by = me()
                      and c.business_date >= manager_window_start()));
