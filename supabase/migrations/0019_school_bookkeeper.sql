-- Goddard bookkeeper: a separate login that only sees the Goddard schools it is
-- assigned to (upload FMS reports and the other school reports, see the numbers).
-- Nothing on the liquor-store side. Safe to run more than once.

alter type app_role add value if not exists 'school_bookkeeper';

create or replace function is_school_bookkeeper_of(b uuid) returns boolean
language sql stable as $$ select coalesce(my_role()::text = 'school_bookkeeper', false) and has_business(b) $$;

drop policy if exists sm_school_bk on school_months;
drop policy if exists sf_school_bk on school_files;
create policy sm_school_bk on school_months for all using (is_school_bookkeeper_of(business_id)) with check (is_school_bookkeeper_of(business_id));
create policy sf_school_bk on school_files for all using (is_school_bookkeeper_of(business_id)) with check (is_school_bookkeeper_of(business_id));

drop policy if exists school_reports_bk_read on storage.objects;
drop policy if exists school_reports_bk_write on storage.objects;
drop policy if exists school_reports_bk_delete on storage.objects;
create policy school_reports_bk_read on storage.objects for select using (
  bucket_id = 'school-reports' and public.is_school_bookkeeper_of(nullif((storage.foldername(name))[1], '')::uuid));
create policy school_reports_bk_write on storage.objects for insert with check (
  bucket_id = 'school-reports' and public.is_school_bookkeeper_of(nullif((storage.foldername(name))[1], '')::uuid));
create policy school_reports_bk_delete on storage.objects for delete using (
  bucket_id = 'school-reports' and public.is_school_bookkeeper_of(nullif((storage.foldername(name))[1], '')::uuid));
