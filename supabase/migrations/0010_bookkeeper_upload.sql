-- The bookkeeper can add POS reports for days that don't have one yet (any store).
-- No replacing a day and no cash entry. Safe to run more than once.

drop policy if exists pos_files_bookkeeper_read on pos_files;
drop policy if exists pos_files_bookkeeper_add  on pos_files;
drop policy if exists pos_bookkeeper_add        on pos_daily;
drop policy if exists dept_bookkeeper_add       on pos_departments;

create policy pos_files_bookkeeper_read on pos_files for select using (is_bookkeeper());
create policy pos_files_bookkeeper_add on pos_files for insert
  with check (is_bookkeeper() and source = 'upload'
              and (business_id is null
                   or not exists (select 1 from pos_daily p where p.business_id = pos_files.business_id
                                  and p.business_date = pos_files.business_date)));
create policy pos_bookkeeper_add on pos_daily for insert
  with check (is_bookkeeper() and business_date < (now() at time zone 'America/New_York')::date);
create policy dept_bookkeeper_add on pos_departments for insert
  with check (is_bookkeeper() and dept_day_empty(business_id, business_date));
