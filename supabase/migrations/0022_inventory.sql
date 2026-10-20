-- Forecasting: inventory on hand by department (uploaded monthly / quarterly per store),
-- compared with the department sales already coming in from the nightly POS reports.
-- Master admins only. Safe to run more than once.

create table if not exists inventory_snapshots (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id) on delete cascade,
  as_of       date not null,
  source      text,                          -- file name, or 'typed in'
  uploaded_by text not null default me(),
  uploaded_at timestamptz not null default now(),
  unique (business_id, as_of)
);

create table if not exists inventory_lines (
  snapshot_id  uuid not null references inventory_snapshots(id) on delete cascade,
  department   text not null,
  qty          numeric(12,2),
  cost_value   numeric(14,2) not null,        -- inventory at cost
  retail_value numeric(14,2),
  primary key (snapshot_id, department)
);
alter table inventory_lines add column if not exists categories jsonb;   -- [{category, value}] inside the department

alter table inventory_snapshots enable row level security;
alter table inventory_lines enable row level security;
drop policy if exists admin_all on inventory_snapshots;
drop policy if exists admin_all on inventory_lines;
create policy admin_all on inventory_snapshots for all using (is_admin()) with check (is_admin());
create policy admin_all on inventory_lines for all using (is_admin()) with check (is_admin());
