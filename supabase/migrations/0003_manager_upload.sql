-- Managers work on the PREVIOUS business day (the POS report prints at night),
-- and can catch up on recent days that haven't been submitted yet (sick days,
-- days off). The window is a setting: manager_catchup_days (default 7).
-- Until the nightly email pickup is live, they may also upload their own store's
-- POS report for those days only.

insert into settings values ('manager_catchup_days', '7') on conflict (key) do nothing;

create or replace function catchup_days() returns int
language sql stable security definer set search_path = public as $$
  select coalesce((select (value #>> '{}')::int from settings where key = 'manager_catchup_days'), 7)
$$;

-- Days a manager may open: yesterday (always, so they can see it was submitted),
-- plus any day in the catch-up window that has no close-out yet.
create or replace function manager_date_ok(b uuid, d date) returns boolean
language sql stable security definer set search_path = public as $$
  with t as (select (now() at time zone bz.timezone)::date as today from businesses bz where bz.id = b)
  select coalesce((
    select d = t.today - 1
        or (d between t.today - catchup_days() and t.today - 1
            and not exists (select 1 from closeouts c where c.business_id = b and c.business_date = d))
    from t), false)
$$;

-- The open days, oldest first (for the manager screen)
create or replace function manager_open_dates(b uuid) returns setof date
language sql stable security definer set search_path = public as $$
  select d::date from businesses bz,
    generate_series((now() at time zone bz.timezone)::date - catchup_days(), (now() at time zone bz.timezone)::date - 1, interval '1 day') d
  where bz.id = b and is_manager_of(b) and manager_date_ok(b, d::date)
  order by d
$$;

-- Replace the "today only" rules with the new day rule
drop policy if exists pos_manager      on pos_daily;
drop policy if exists co_manager_read  on closeouts;
drop policy if exists co_manager_add   on closeouts;
drop policy if exists coe_manager_read on closeout_employees;
drop policy if exists coe_manager_add  on closeout_employees;

create policy pos_manager on pos_daily for select
  using (is_manager_of(business_id) and (manager_date_ok(business_id, business_date)
         or exists (select 1 from closeouts c where c.business_id = pos_daily.business_id
                    and c.business_date = pos_daily.business_date and c.submitted_by = me()
                    and c.business_date >= (now() at time zone 'America/New_York')::date - catchup_days())));
create policy co_manager_read on closeouts for select
  using (is_manager_of(business_id) and (manager_date_ok(business_id, business_date)
         or (submitted_by = me() and business_date >= (now() at time zone 'America/New_York')::date - catchup_days())));
create policy co_manager_add on closeouts for insert
  with check (is_manager_of(business_id) and manager_date_ok(business_id, business_date) and submitted_by = me());
create policy coe_manager_read on closeout_employees for select
  using (exists (select 1 from closeouts c where c.id = closeout_id
                 and is_manager_of(c.business_id) and (manager_date_ok(c.business_id, c.business_date)
                      or (c.submitted_by = me() and c.business_date >= (now() at time zone 'America/New_York')::date - catchup_days()))));
create policy coe_manager_add on closeout_employees for insert
  with check (exists (select 1 from closeouts c where c.id = closeout_id
                      and is_manager_of(c.business_id) and c.submitted_by = me()
                      and c.business_date >= (now() at time zone 'America/New_York')::date - catchup_days()));

-- Temporary manager upload of their own store's POS report, open days only
create policy pos_files_manager_read on pos_files for select
  using (is_manager_of(business_id));
create policy pos_files_manager_add on pos_files for insert
  with check (source = 'upload' and is_manager_of(business_id) and manager_date_ok(business_id, business_date));
create policy pos_manager_add on pos_daily for insert
  with check (is_manager_of(business_id) and manager_date_ok(business_id, business_date));
create policy pos_manager_update on pos_daily for update
  using (is_manager_of(business_id) and manager_date_ok(business_id, business_date))
  with check (is_manager_of(business_id) and manager_date_ok(business_id, business_date));
create policy dept_manager_read on pos_departments for select
  using (is_manager_of(business_id) and manager_date_ok(business_id, business_date));
create policy dept_manager_add on pos_departments for insert
  with check (is_manager_of(business_id) and manager_date_ok(business_id, business_date));
create policy dept_manager_delete on pos_departments for delete
  using (is_manager_of(business_id) and manager_date_ok(business_id, business_date));

-- Difference stays blank until the POS report for that day is in
create or replace view closeout_results with (security_invoker = true) as
select c.*,
       p.cash_sales, p.card_sales, p.total_sales,
       case when p.cash_sales is null then null
            else round(c.cash_counted + c.paid_out + c.petty_change - p.cash_sales, 2) end as difference,
       (c.cash_counted - c.held_for_next + c.carried_in) as deposit_amount
from closeouts c
left join pos_daily p on p.business_id = c.business_id and p.business_date = c.business_date;
