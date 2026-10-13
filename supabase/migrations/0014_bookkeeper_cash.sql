-- The bookkeeper can correct (or fill in) a day's cash close-out. Every change is
-- logged with before/after and flagged to the admins, like sales changes.
-- Safe to run more than once.

alter table pos_changes add column if not exists kind text not null default 'sales';

drop policy if exists co_bookkeeper_update on closeouts;
drop policy if exists co_bookkeeper_add on closeouts;
create policy co_bookkeeper_update on closeouts for update using (is_bookkeeper()) with check (is_bookkeeper());
create policy co_bookkeeper_add on closeouts for insert
  with check (is_bookkeeper() and business_date < (now() at time zone 'America/New_York')::date);
