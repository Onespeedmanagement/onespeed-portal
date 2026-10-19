-- Contracts for Goddard: each contract belongs to a portfolio. Goddard admins
-- manage Goddard contracts only; master admins see all. Safe to run more than once.

alter table contracts add column if not exists portfolio_id uuid references portfolios(id);
update contracts c set portfolio_id = coalesce(
    (select b.portfolio_id from businesses b where b.id = c.business_id),
    (select id from portfolios where kind = 'retail' order by sort limit 1))
  where portfolio_id is null;

create or replace function contract_is_school(c uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from contracts x where x.id = c and is_school_portfolio(x.portfolio_id))
$$;

-- Who can be picked for reminder emails (names and emails only)
create or replace function reminder_people(school boolean) returns table (email text, display_name text)
language sql stable security definer set search_path = public as $$
  select u.email, u.display_name from app_users u
  where u.active and (is_admin() or is_school_admin())
    and (u.role::text = 'admin' or (school and u.role::text = 'school_admin'))
  order by u.email
$$;

drop policy if exists contracts_school_admin on contracts;
drop policy if exists contract_files_school_admin on contract_files;
create policy contracts_school_admin on contracts for all
  using (is_school_admin() and is_school_portfolio(portfolio_id) and (business_id is null or is_school(business_id)))
  with check (is_school_admin() and is_school_portfolio(portfolio_id) and (business_id is null or is_school(business_id)));
create policy contract_files_school_admin on contract_files for all
  using (is_school_admin() and contract_is_school(contract_id)) with check (is_school_admin() and contract_is_school(contract_id));

drop policy if exists contracts_sa_read on storage.objects;
drop policy if exists contracts_sa_write on storage.objects;
drop policy if exists contracts_sa_delete on storage.objects;
create policy contracts_sa_read on storage.objects for select using (
  bucket_id = 'contracts' and public.is_school_admin() and public.contract_is_school(nullif((storage.foldername(name))[1], '')::uuid));
create policy contracts_sa_write on storage.objects for insert with check (
  bucket_id = 'contracts' and public.is_school_admin() and public.contract_is_school(nullif((storage.foldername(name))[1], '')::uuid));
create policy contracts_sa_delete on storage.objects for delete using (
  bucket_id = 'contracts' and public.is_school_admin() and public.contract_is_school(nullif((storage.foldername(name))[1], '')::uuid));
