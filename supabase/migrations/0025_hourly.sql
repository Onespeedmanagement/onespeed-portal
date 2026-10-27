-- Manager tools: sales by hour (from the nightly POS report), the "Items to push" list
-- (POS Unsold Item List report) and weekly schedules (When I Work export).
-- Safe to run more than once.

-- 1. Sales by hour, kept with each day
alter table pos_daily add column if not exists hourly jsonb;   -- [{hour, count, amount}]

-- 2. Items to push: the latest Unsold Item List per store
create table if not exists unsold_lists (
  business_id uuid primary key references businesses(id) on delete cascade,
  period_from date, period_to date,
  filename    text,
  uploaded_by text not null default me(),
  uploaded_at timestamptz not null default now()
);
create table if not exists unsold_items (
  business_id uuid not null references businesses(id) on delete cascade,
  sku         text not null,
  description text not null,
  kind        text,                 -- Wine, Liquor, Beer & seltzer, THC drinks, Other
  stock       numeric(12,2),
  cost        numeric(12,2),
  price       numeric(12,2),
  primary key (business_id, sku)
);

-- 3. Schedules: one row per shift
create table if not exists schedule_shifts (
  id          bigint generated always as identity primary key,
  business_id uuid not null references businesses(id) on delete cascade,
  shift_date  date not null,
  employee    text not null,
  position    text,
  start_min   int not null,         -- minutes after midnight
  end_min     int not null,         -- can run past midnight (e.g. 1440 = 12am)
  hours       numeric(6,2),
  rate        numeric(8,2),
  cost        numeric(10,2),
  uploaded_by text not null default me(),
  uploaded_at timestamptz not null default now()
);
create index if not exists schedule_shifts_biz_date on schedule_shifts (business_id, shift_date);

alter table unsold_lists enable row level security;
alter table unsold_items enable row level security;
alter table schedule_shifts enable row level security;
drop policy if exists admin_all on unsold_lists;
drop policy if exists admin_all on unsold_items;
drop policy if exists admin_all on schedule_shifts;
drop policy if exists mgr_own on unsold_lists;
drop policy if exists mgr_own on unsold_items;
drop policy if exists mgr_own on schedule_shifts;
create policy admin_all on unsold_lists for all using (is_admin()) with check (is_admin());
create policy admin_all on unsold_items for all using (is_admin()) with check (is_admin());
create policy admin_all on schedule_shifts for all using (is_admin()) with check (is_admin());
create policy mgr_own on unsold_lists for all using (is_manager_of(business_id)) with check (is_manager_of(business_id));
create policy mgr_own on unsold_items for all using (is_manager_of(business_id)) with check (is_manager_of(business_id));
create policy mgr_own on schedule_shifts for all using (is_manager_of(business_id)) with check (is_manager_of(business_id));

-- Sales by hour for a manager's own store (their normal access only covers recent days)
create or replace function store_hourly(b uuid, since date) returns table (business_date date, total_sales numeric, transactions int, hourly jsonb)
language sql stable security definer set search_path = public as $$
  select p.business_date, p.total_sales, p.transactions, p.hourly from pos_daily p
  where p.business_id = b and p.business_date >= since and (is_admin() or is_manager_of(b))
  order by p.business_date
$$;
