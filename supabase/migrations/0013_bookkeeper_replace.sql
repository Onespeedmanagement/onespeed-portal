-- The bookkeeper can replace a day's POS report. Every replacement is logged
-- (numbers before and after) and shows on Discrepancies and in the morning email.
-- Safe to run more than once.

create table if not exists pos_changes (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id) on delete cascade,
  business_date date not null,
  changed_by    text not null default me(),
  changed_at    timestamptz not null default now(),
  before        jsonb,
  after         jsonb
);
alter table pos_changes enable row level security;
drop policy if exists admin_all on pos_changes;
drop policy if exists pc_book_add on pos_changes;
drop policy if exists pc_book_read on pos_changes;
create policy admin_all on pos_changes for all using (is_admin()) with check (is_admin());
create policy pc_book_add on pos_changes for insert with check (is_bookkeeper() and changed_by = me());
create policy pc_book_read on pos_changes for select using (is_bookkeeper());

-- Replace = update the day's totals and swap its department lines
drop policy if exists pos_bookkeeper_update on pos_daily;
drop policy if exists dept_bookkeeper_delete on pos_departments;
drop policy if exists dept_bookkeeper_add on pos_departments;
drop policy if exists pos_files_bookkeeper_add on pos_files;
create policy pos_bookkeeper_update on pos_daily for update using (is_bookkeeper()) with check (is_bookkeeper());
create policy dept_bookkeeper_delete on pos_departments for delete using (is_bookkeeper());
create policy dept_bookkeeper_add on pos_departments for insert with check (is_bookkeeper());
create policy pos_files_bookkeeper_add on pos_files for insert with check (is_bookkeeper() and source = 'upload');

alter table resolutions drop constraint if exists resolutions_kind_check;
alter table resolutions add constraint resolutions_kind_check
  check (kind in ('short', 'over', 'missing_closeout', 'file', 'override', 'changed'));
