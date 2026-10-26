-- Expense audit: Amazon orders, Chase card activity and the QuickBooks bank register,
-- per store, categorized and checked for savings. Master admins only.
-- Safe to run more than once.

create table if not exists audit_files (
  id          uuid primary key default gen_random_uuid(),
  source      text not null check (source in ('amazon', 'chase', 'register')),
  business_id uuid references businesses(id) on delete cascade,   -- null = company-wide card
  label       text,                                               -- e.g. card "…4821"
  filename    text not null,
  rows        int not null default 0,
  date_from   date, date_to date,
  uploaded_by text not null default me(),
  uploaded_at timestamptz not null default now()
);

create table if not exists audit_txns (
  id          bigint generated always as identity primary key,
  file_id     uuid not null references audit_files(id) on delete cascade,
  source      text not null,
  business_id uuid references businesses(id) on delete cascade,
  txn_date    date not null,
  vendor      text,               -- merchant / payee / seller
  item        text,               -- Amazon item title, or memo
  item_key    text,               -- ASIN or normalized title, for "same item"
  qty         numeric(12,2),
  unit_price  numeric(12,2),
  amount      numeric(12,2) not null,   -- money out is positive
  category    text,
  ref         text,               -- order id / check no.
  fingerprint text not null        -- re-uploading overlapping downloads skips rows already in
);
create index if not exists audit_txns_fp on audit_txns (source, fingerprint);
create index if not exists audit_txns_biz on audit_txns (business_id, source, txn_date);

-- Your own category rules: text found in vendor/item → category (they win over the built-in ones)
create table if not exists audit_rules (
  id       uuid primary key default gen_random_uuid(),
  pattern  text not null,
  category text not null,
  created_at timestamptz not null default now()
);

-- Price found elsewhere for an Amazon item (filled in after the monthly price check)
create table if not exists audit_alt_prices (
  item_key   text primary key,
  supplier   text not null,
  unit_price numeric(12,2) not null,
  note       text,
  updated_at timestamptz not null default now()
);

-- Things reviewed and marked OK, so they stop showing as flags
create table if not exists audit_dismissed (
  key        text primary key,
  note       text,
  dismissed_by text not null default me(),
  dismissed_at timestamptz not null default now()
);

do $$ declare t text; begin
  foreach t in array array['audit_files','audit_txns','audit_rules','audit_alt_prices','audit_dismissed'] loop
    execute format('alter table %I enable row level security', t);
    execute format('drop policy if exists admin_all on %I', t);
    execute format('create policy admin_all on %I for all using (is_admin()) with check (is_admin())', t);
  end loop;
end $$;
