-- Goddard Schools: monthly FMS financial reports (parsed into numbers) and a
-- library for the other school reports (forecasted billing, new enrollments,
-- A/R ledger, deposit history). Schools are businesses in the Goddard portfolio;
-- the liquor-store pages only ever see the "stores" view.
-- Safe to run more than once.

alter table portfolios add column if not exists kind text not null default 'retail';
alter table portfolios drop constraint if exists portfolios_kind_check;
alter table portfolios add constraint portfolios_kind_check check (kind in ('retail', 'school', 'hotel'));
update portfolios set kind = 'school', status = 'live' where name ilike 'goddard%';
update portfolios set kind = 'hotel' where name ilike 'hotel%';

-- Liquor stores only (everything POS / cash / QuickBooks uses this)
create or replace view stores with (security_invoker = true) as
  select b.* from businesses b join portfolios p on p.id = b.portfolio_id where p.kind = 'retail';
grant select on stores to authenticated;

-- One row per school per month, from the FMS Monthly Financial Report
create table if not exists school_months (
  business_id      uuid not null references businesses(id) on delete cascade,
  month            date not null,                -- first of the month
  tuition          jsonb not null default '[]',  -- [{label, amount}] by classroom
  other_fees       jsonb not null default '[]',  -- [{label, amount}] registration, discounts…
  tuition_total    numeric(12,2),
  other_total      numeric(12,2),
  revenue          numeric(12,2),
  cash_receipts    numeric(12,2),
  preschool_rate   numeric(12,2),
  not_subject      numeric(12,2),
  royalties_due    numeric(12,2),
  marketing_due    numeric(12,2),
  expenses         jsonb not null default '[]',  -- [{label, amount}]
  total_opex       numeric(12,2),
  operating_income numeric(12,2),
  capex            numeric(12,2),
  debt_service     numeric(12,2),
  explanations     text,
  report_date      text,
  filename         text,
  storage_path     text,
  uploaded_by      text not null default me(),
  uploaded_at      timestamptz not null default now(),
  primary key (business_id, month)
);

-- The other reports, kept as files by school and month
create table if not exists school_files (
  id           uuid primary key default gen_random_uuid(),
  business_id  uuid not null references businesses(id) on delete cascade,
  month        date not null,
  kind         text not null check (kind in ('financial', 'forecast', 'new_enrollments', 'ar_ledger', 'deposits', 'other')),
  filename     text not null,
  storage_path text not null,
  uploaded_by  text not null default me(),
  uploaded_at  timestamptz not null default now()
);
create index if not exists school_files_biz_month on school_files (business_id, month);

alter table school_months enable row level security;
alter table school_files enable row level security;
drop policy if exists sm_staff on school_months;
drop policy if exists sm_investor on school_months;
drop policy if exists sf_staff on school_files;
drop policy if exists sf_investor on school_files;
create policy sm_staff on school_months for all using (is_admin() or is_bookkeeper()) with check (is_admin() or is_bookkeeper());
create policy sm_investor on school_months for select using (investor_can(business_id, 'sales') or investor_can(business_id, 'owners'));
create policy sf_staff on school_files for all using (is_admin() or is_bookkeeper()) with check (is_admin() or is_bookkeeper());
create policy sf_investor on school_files for select using (investor_can(business_id, 'owners'));

-- Private file storage: <school id>/<month>/<file>
insert into storage.buckets (id, name, public) values ('school-reports', 'school-reports', false)
  on conflict (id) do nothing;
drop policy if exists school_reports_read on storage.objects;
drop policy if exists school_reports_write on storage.objects;
drop policy if exists school_reports_delete on storage.objects;
create policy school_reports_read on storage.objects for select using (
  bucket_id = 'school-reports' and (public.is_admin() or public.is_bookkeeper()
    or public.investor_can(nullif((storage.foldername(name))[1], '')::uuid, 'owners')));
create policy school_reports_write on storage.objects for insert with check (
  bucket_id = 'school-reports' and (public.is_admin() or public.is_bookkeeper()));
create policy school_reports_delete on storage.objects for delete using (
  bucket_id = 'school-reports' and (public.is_admin() or public.is_bookkeeper()));
