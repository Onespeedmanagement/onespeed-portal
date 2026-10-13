-- QuickBooks register import: outstanding (not yet cleared) payments per store.
-- Each daily upload adds what's new; anything no longer outstanding on the file
-- is marked cleared that day. Payments dated before qb_track_from are ignored.
-- Safe to run more than once.

insert into settings values ('qb_track_from', '"2026-10-12"') on conflict (key) do nothing;

create table if not exists qb_outstanding (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  fingerprint text not null,                 -- date|ref|payee|amount|memo (or payroll|date)
  txn_date    date not null,
  ref_no      text,
  payee       text,
  memo        text,
  txn_type    text,
  account     text,
  amount      numeric(12,2) not null,
  first_seen  date not null,                 -- report date of the upload it first appeared on
  last_seen   date not null,
  cleared_on  date,                          -- report date of the upload it dropped off
  updated_by  text not null default me(),
  unique (business_id, fingerprint)
);
create index if not exists qb_outstanding_open on qb_outstanding (business_id, cleared_on);

alter table owners_report add column if not exists bank_balance        numeric(12,2);
alter table owners_report add column if not exists outstanding_total   numeric(12,2);
alter table owners_report add column if not exists deposits_in_transit numeric(12,2);
alter table owners_report add column if not exists source              text;

alter table qb_outstanding enable row level security;
drop policy if exists admin_all on qb_outstanding;
drop policy if exists qbo_book on qb_outstanding;
drop policy if exists qbo_investor on qb_outstanding;
create policy admin_all on qb_outstanding for all using (is_admin()) with check (is_admin());
create policy qbo_book on qb_outstanding for all using (is_bookkeeper()) with check (is_bookkeeper());
create policy qbo_investor on qb_outstanding for select using (investor_can(business_id, 'owners'));
