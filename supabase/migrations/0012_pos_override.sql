-- The bookkeeper (or an admin) can save a POS report whose own totals don't add up.
-- The day is flagged and shows on Discrepancies and in the morning email for the admins.
-- Safe to run more than once.

alter table pos_daily add column if not exists override_note text;
alter table pos_daily add column if not exists override_by   text;

-- A report held earlier can be turned into a saved one by the bookkeeper
drop policy if exists pos_files_bookkeeper_update on pos_files;
create policy pos_files_bookkeeper_update on pos_files for update
  using (is_bookkeeper() and status = 'held')
  with check (is_bookkeeper());

-- "Saved anyway" can be marked resolved on Discrepancies
alter table resolutions drop constraint if exists resolutions_kind_check;
alter table resolutions add constraint resolutions_kind_check
  check (kind in ('short', 'over', 'missing_closeout', 'file', 'override'));
