-- Monthly totals from before the portal had daily POS reports (from the
-- "Monthly Store Performance Report" sheet). The dashboard uses a month from
-- here whenever the daily POS reports don't cover that month.

create table if not exists monthly_history (
  business_id uuid not null references businesses(id) on delete cascade,
  month       date not null check (extract(day from month) = 1),
  revenue     numeric(14,2) not null,
  customers   integer,
  profit_pct  numeric(6,2),
  source      text,
  updated_by  text not null default me(),
  updated_at  timestamptz not null default now(),
  primary key (business_id, month)
);

alter table monthly_history enable row level security;
create policy admin_all on monthly_history for all using (is_admin()) with check (is_admin());
create policy mh_bookkeeper on monthly_history for select using (is_bookkeeper());
create policy mh_investor on monthly_history for select using (investor_can(business_id, 'sales'));
