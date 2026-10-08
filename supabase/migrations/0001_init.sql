-- One Speed Management Portal: initial schema
-- Every access rule lives in the database (row level security), so a user
-- can never read or change data outside their role, even with direct API access.

create extension if not exists pgcrypto;

-- ─────────────────────────────────────────────────────────────
-- Who can sign in
-- ─────────────────────────────────────────────────────────────
create type app_role as enum ('admin', 'bookkeeper', 'manager', 'investor');

create table app_users (
  email        text primary key check (email = lower(email)),
  display_name text,
  role         app_role not null,
  active       boolean not null default true,
  -- investor visibility switches (ignored for other roles)
  can_see_sales   boolean not null default true,
  can_see_owners  boolean not null default false,
  can_see_cash    boolean not null default false,
  created_at   timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Portfolio → businesses (stores, schools, hotels)
-- ─────────────────────────────────────────────────────────────
create table portfolios (
  id     uuid primary key default gen_random_uuid(),
  name   text not null unique,              -- Wine & Spirits, Goddard Schools, Hotels
  status text not null default 'live' check (status in ('live', 'coming_soon')),
  sort   int  not null default 0
);

create table businesses (
  id            uuid primary key default gen_random_uuid(),
  portfolio_id  uuid not null references portfolios(id),
  name          text not null unique,
  pos_match     text,                       -- text that identifies this store in POS emails/files
  timezone      text not null default 'America/New_York',
  active        boolean not null default true,
  created_at    timestamptz not null default now()
);

-- Managers: their store(s). Investors: the businesses admins selected.
create table business_access (
  email       text not null references app_users(email) on delete cascade,
  business_id uuid not null references businesses(id) on delete cascade,
  primary key (email, business_id)
);

-- ─────────────────────────────────────────────────────────────
-- Helper functions used by the access rules
-- ─────────────────────────────────────────────────────────────
create or replace function me() returns text
language sql stable as $$ select lower(coalesce(auth.jwt() ->> 'email', '')) $$;

create or replace function my_role() returns app_role
language sql stable security definer set search_path = public as $$
  select role from app_users where email = me() and active
$$;

create or replace function is_admin() returns boolean
language sql stable as $$ select coalesce(my_role() = 'admin', false) $$;

create or replace function is_bookkeeper() returns boolean
language sql stable as $$ select coalesce(my_role() = 'bookkeeper', false) $$;

create or replace function has_business(b uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from business_access where email = me() and business_id = b)
$$;

create or replace function investor_can(b uuid, area text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from app_users u join business_access a on a.email = u.email
    where u.email = me() and u.active and u.role = 'investor' and a.business_id = b
      and case area when 'sales'  then u.can_see_sales
                    when 'owners' then u.can_see_owners
                    when 'cash'   then u.can_see_cash
                    else false end)
$$;

-- The one business date a manager may see/enter: today in the store's time zone,
-- or yesterday until 6 AM (for late-night close-outs).
create or replace function manager_open_date(b uuid) returns date
language sql stable security definer set search_path = public as $$
  select case when extract(hour from now() at time zone bz.timezone) < 6
              then (now() at time zone bz.timezone)::date - 1
              else (now() at time zone bz.timezone)::date end
  from businesses bz where bz.id = b
$$;

create or replace function is_manager_of(b uuid) returns boolean
language sql stable as $$ select coalesce(my_role() = 'manager', false) and has_business(b) $$;

-- ─────────────────────────────────────────────────────────────
-- POS data (from the nightly emails or manual upload)
-- ─────────────────────────────────────────────────────────────
create table pos_files (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid references businesses(id),
  business_date date,
  filename      text not null,
  sha256        text not null unique,       -- the same file twice is ignored
  storage_path  text,
  source        text not null check (source in ('email', 'upload')),
  status        text not null default 'received'
                check (status in ('received', 'processed', 'held', 'unknown_store', 'duplicate', 'error')),
  message       text,
  received_at   timestamptz not null default now()
);

create table pos_daily (
  business_id   uuid not null references businesses(id),
  business_date date not null,
  total_sales   numeric(12,2),
  cost          numeric(12,2),
  profit        numeric(12,2),
  profit_pct    numeric(6,2),               -- exactly as the POS reports it
  card_sales    numeric(12,2),
  cash_sales    numeric(12,2),
  transactions  int,
  file_id       uuid references pos_files(id),
  updated_at    timestamptz not null default now(),
  primary key (business_id, business_date)
);

create table pos_departments (
  business_id   uuid not null references businesses(id),
  business_date date not null,
  department    text not null,
  qty           numeric(12,2),
  sales         numeric(12,2),
  cost          numeric(12,2),
  profit        numeric(12,2),
  profit_pct    numeric(6,2),
  primary key (business_id, business_date, department)
);

-- ─────────────────────────────────────────────────────────────
-- Register employees (they don't sign in)
-- ─────────────────────────────────────────────────────────────
create table employees (
  id          uuid primary key default gen_random_uuid(),
  business_id uuid not null references businesses(id),
  name        text not null,
  active      boolean not null default true,  -- "removed" = inactive; history kept
  created_at  timestamptz not null default now()
);

create table employee_changes (
  id          bigint generated always as identity primary key,
  employee_id uuid not null references employees(id),
  action      text not null check (action in ('added', 'renamed', 'removed', 'restored')),
  old_name    text,
  new_name    text,
  changed_by  text not null default me(),
  changed_at  timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Manager close-out
-- ─────────────────────────────────────────────────────────────
create table closeouts (
  id              uuid primary key default gen_random_uuid(),
  business_id     uuid not null references businesses(id),
  business_date   date not null,
  cash_counted    numeric(12,2) not null,
  paid_out        numeric(12,2) not null default 0,
  paid_out_reason text,
  petty_change    numeric(12,2) not null default 0,
  held_for_next   numeric(12,2) not null default 0,
  carried_in      numeric(12,2) not null default 0,  -- held from the previous day, added to this deposit
  deposit_date    date,
  note            text,
  submitted_by    text not null default me(),
  submitted_at    timestamptz not null default now(),
  unique (business_id, business_date)
);

create table closeout_employees (
  closeout_id uuid not null references closeouts(id) on delete cascade,
  employee_id uuid not null references employees(id),
  primary key (closeout_id, employee_id)
);

create table settings (
  key   text primary key,
  value jsonb not null
);
insert into settings values ('match_tolerance', '1.00');

-- ─────────────────────────────────────────────────────────────
-- Bookkeeper: QuickBooks status, Owners Report, questions
-- ─────────────────────────────────────────────────────────────
create table qb_marks (
  business_id   uuid not null references businesses(id),
  business_date date not null,
  entered       boolean not null default false,
  marked_by     text not null default me(),
  marked_at     timestamptz not null default now(),
  primary key (business_id, business_date)
);

create table owners_report (
  business_id   uuid not null references businesses(id),
  business_date date not null,
  qb_balance    numeric(12,2) not null,
  balance_status text not null default 'good' check (balance_status in ('good', 'watch', 'low')),
  entered_by    text not null default me(),
  entered_at    timestamptz not null default now(),
  primary key (business_id, business_date)
);

create table distributors (
  id   uuid primary key default gen_random_uuid(),
  name text not null unique
);

create table ledger_lines (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid not null references businesses(id),
  business_date  date not null,
  memo           text not null,
  line_type      text not null check (line_type in ('distributor_check', 'ach', 'tax', 'card_payment', 'deposit', 'other')),
  distributor_id uuid references distributors(id),
  check_number   text,
  check_date     date,
  debit          numeric(12,2) not null default 0,
  credit         numeric(12,2) not null default 0,
  entered_by     text not null default me(),
  entered_at     timestamptz not null default now()
);

create table questions (
  id            uuid primary key default gen_random_uuid(),
  business_id   uuid not null references businesses(id),
  business_date date not null,
  body          text not null,
  asked_by      text not null default me(),
  asked_at      timestamptz not null default now(),
  resolved      boolean not null default false,
  resolved_by   text,
  resolved_at   timestamptz,
  admin_note    text
);

-- Admin-added calendar days (US holidays are computed in the app)
create table custom_days (
  id          uuid primary key default gen_random_uuid(),
  day         date not null,
  business_id uuid references businesses(id),     -- null = all stores
  label       text not null,
  closed      boolean not null default false
);

-- Everything important that changes, and who changed it
create table audit_log (
  id         bigint generated always as identity primary key,
  actor      text not null default me(),
  action     text not null,
  details    jsonb,
  at         timestamptz not null default now()
);

-- ─────────────────────────────────────────────────────────────
-- Close-out difference, ready to read
-- difference = cash counted + paid out + petty change − POS cash
-- deposit    = cash counted − held for next deposit + carried in from the previous day
-- ─────────────────────────────────────────────────────────────
create or replace view closeout_results with (security_invoker = true) as
select c.*,
       p.cash_sales, p.card_sales, p.total_sales,
       round(c.cash_counted + c.paid_out + c.petty_change - coalesce(p.cash_sales, 0), 2) as difference,
       (c.cash_counted - c.held_for_next + c.carried_in) as deposit_amount
from closeouts c
left join pos_daily p on p.business_id = c.business_id and p.business_date = c.business_date;

-- ─────────────────────────────────────────────────────────────
-- Row level security
-- ─────────────────────────────────────────────────────────────
alter table app_users          enable row level security;
alter table portfolios         enable row level security;
alter table businesses         enable row level security;
alter table business_access    enable row level security;
alter table pos_files          enable row level security;
alter table pos_daily          enable row level security;
alter table pos_departments    enable row level security;
alter table employees          enable row level security;
alter table employee_changes   enable row level security;
alter table closeouts          enable row level security;
alter table closeout_employees enable row level security;
alter table settings           enable row level security;
alter table qb_marks           enable row level security;
alter table owners_report      enable row level security;
alter table distributors       enable row level security;
alter table ledger_lines       enable row level security;
alter table questions          enable row level security;
alter table custom_days        enable row level security;
alter table audit_log          enable row level security;

-- Admins: full access everywhere
do $$
declare t text;
begin
  foreach t in array array['app_users','portfolios','businesses','business_access','pos_files','pos_daily',
    'pos_departments','employees','employee_changes','closeouts','closeout_employees','settings','qb_marks',
    'owners_report','distributors','ledger_lines','questions','custom_days','audit_log']
  loop
    execute format('create policy admin_all on %I for all using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;

-- Everyone signed in can read their own user row
create policy self_read on app_users for select using (email = me());

-- Business list: bookkeeper sees all; managers/investors see theirs
create policy biz_read on businesses for select
  using (is_bookkeeper() or has_business(id));
create policy portfolio_read on portfolios for select
  using (is_bookkeeper() or exists (select 1 from businesses b where b.portfolio_id = portfolios.id and has_business(b.id)));
create policy access_self on business_access for select using (email = me());

-- POS daily totals
create policy pos_bookkeeper on pos_daily for select using (is_bookkeeper());
create policy pos_investor   on pos_daily for select using (investor_can(business_id, 'sales'));
create policy pos_manager    on pos_daily for select
  using (is_manager_of(business_id) and business_date = manager_open_date(business_id));
create policy dept_investor  on pos_departments for select using (investor_can(business_id, 'sales'));

-- Employees: managers manage their own store's list (no deleting rows; removal = inactive)
create policy emp_manager_read on employees for select using (is_manager_of(business_id));
create policy emp_manager_add  on employees for insert with check (is_manager_of(business_id));
create policy emp_manager_edit on employees for update
  using (is_manager_of(business_id)) with check (is_manager_of(business_id));
create policy empchg_manager on employee_changes for insert
  with check (exists (select 1 from employees e where e.id = employee_id and is_manager_of(e.business_id)));

-- Close-outs: managers only for their store and the open date; locked once submitted (no update policy)
create policy co_manager_read on closeouts for select
  using (is_manager_of(business_id) and business_date = manager_open_date(business_id));
create policy co_manager_add on closeouts for insert
  with check (is_manager_of(business_id) and business_date = manager_open_date(business_id) and submitted_by = me());
create policy coe_manager_read on closeout_employees for select
  using (exists (select 1 from closeouts c where c.id = closeout_id
                 and is_manager_of(c.business_id) and c.business_date = manager_open_date(c.business_id)));
create policy coe_manager_add on closeout_employees for insert
  with check (exists (select 1 from closeouts c where c.id = closeout_id
                      and is_manager_of(c.business_id) and c.business_date = manager_open_date(c.business_id)));
create policy co_bookkeeper on closeouts for select using (is_bookkeeper());
create policy co_investor   on closeouts for select using (investor_can(business_id, 'cash') or investor_can(business_id, 'owners'));
-- bookkeeper never reads closeout_employees (no employee names)

create policy settings_read on settings for select using (my_role() is not null);

-- Bookkeeper tables
create policy qb_book on qb_marks for all using (is_bookkeeper()) with check (is_bookkeeper());
create policy or_book on owners_report for all using (is_bookkeeper()) with check (is_bookkeeper());
create policy or_investor on owners_report for select using (investor_can(business_id, 'owners'));
create policy ll_book on ledger_lines for all using (is_bookkeeper()) with check (is_bookkeeper());
create policy ll_investor on ledger_lines for select using (investor_can(business_id, 'owners'));
create policy dist_book on distributors for all using (is_bookkeeper()) with check (is_bookkeeper());
create policy dist_investor on distributors for select using (my_role() = 'investor');
create policy q_book_read on questions for select using (is_bookkeeper());
create policy q_book_add  on questions for insert with check (is_bookkeeper() and asked_by = me());

create policy days_read on custom_days for select using (my_role() is not null);
create policy audit_insert on audit_log for insert with check (my_role() is not null and actor = me());

-- ─────────────────────────────────────────────────────────────
-- Starting data
-- ─────────────────────────────────────────────────────────────
insert into portfolios (name, status, sort) values
  ('Wine & Spirits', 'live', 1),
  ('Goddard Schools', 'coming_soon', 2),
  ('Hotels', 'coming_soon', 3);

insert into businesses (portfolio_id, name, pos_match)
select id, x.name, x.pos_match from portfolios p,
  (values ('Christiana Wine & Spirits', 'Christiana Wine'),
          ('Fairfield Liquors', 'Fairfield Liquors'),
          ('University Liquor', 'University Liquor')) as x(name, pos_match)
where p.name = 'Wine & Spirits';

insert into app_users (email, display_name, role) values
  ('ujash@onespeedmanagement.com',      'Ujash Patel',   'admin'),
  ('vrajesh@onespeedmanagement.com',    'Vrajesh Patel', 'admin'),
  ('accounting@onespeedmanagement.com', 'Accounting',    'bookkeeper');
