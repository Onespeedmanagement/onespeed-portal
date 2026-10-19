-- Goddard admin: runs the Goddard Schools portfolio (all schools, uploads, adding
-- schools) but sees nothing of the liquor stores or hotels. Master admins stay "admin".
-- Safe to run more than once.

alter type app_role add value if not exists 'school_admin';

create or replace function is_school_admin() returns boolean
language sql stable as $$ select coalesce(my_role()::text = 'school_admin', false) $$;

create or replace function is_school_portfolio(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from portfolios where id = p and kind = 'school')
$$;

create or replace function is_school(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from businesses x join portfolios p on p.id = x.portfolio_id where x.id = b and p.kind = 'school')
$$;

drop policy if exists portfolio_school_admin on portfolios;
drop policy if exists biz_school_admin_read on businesses;
drop policy if exists biz_school_admin_add on businesses;
drop policy if exists biz_school_admin_edit on businesses;
drop policy if exists sm_school_admin on school_months;
drop policy if exists sf_school_admin on school_files;
create policy portfolio_school_admin on portfolios for select using (is_school_admin() and kind = 'school');
create policy biz_school_admin_read on businesses for select using (is_school_admin() and is_school_portfolio(portfolio_id));
create policy biz_school_admin_add on businesses for insert with check (is_school_admin() and is_school_portfolio(portfolio_id));
create policy biz_school_admin_edit on businesses for update using (is_school_admin() and is_school_portfolio(portfolio_id))
  with check (is_school_admin() and is_school_portfolio(portfolio_id));
create policy sm_school_admin on school_months for all using (is_school_admin() and is_school(business_id)) with check (is_school_admin() and is_school(business_id));
create policy sf_school_admin on school_files for all using (is_school_admin() and is_school(business_id)) with check (is_school_admin() and is_school(business_id));

drop policy if exists school_reports_sa_read on storage.objects;
drop policy if exists school_reports_sa_write on storage.objects;
drop policy if exists school_reports_sa_delete on storage.objects;
create policy school_reports_sa_read on storage.objects for select using (bucket_id = 'school-reports' and public.is_school_admin());
create policy school_reports_sa_write on storage.objects for insert with check (bucket_id = 'school-reports' and public.is_school_admin());
create policy school_reports_sa_delete on storage.objects for delete using (bucket_id = 'school-reports' and public.is_school_admin());
