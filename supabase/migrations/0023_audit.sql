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

-- The bookkeeper's daily QuickBooks register upload also feeds the audit.
-- The bookkeeper can't see the audit, so this runs with the owner's rights and only adds rows.
create or replace function audit_ingest_register(b uuid, rows jsonb) returns int
language plpgsql security definer set search_path = public as $$
declare f uuid; n int;
begin
  if not (is_admin() or is_bookkeeper()) then raise exception 'not allowed'; end if;
  if jsonb_typeof(rows) <> 'array' then return 0; end if;
  select id into f from audit_files where source = 'register' and business_id = b and filename = 'QuickBooks daily upload' limit 1;
  if f is null then
    insert into audit_files (source, business_id, filename, label) values ('register', b, 'QuickBooks daily upload', 'bank register') returning id into f;
  end if;
  insert into audit_txns (file_id, source, business_id, txn_date, ref, vendor, item, amount, fingerprint)
  select f, 'register', b, (r->>0)::date, nullif(r->>1, ''), nullif(r->>2, ''), nullif(r->>3, ''), (r->>4)::numeric, r->>5
  from jsonb_array_elements(rows) r
  where jsonb_typeof(r) = 'array' and (r->>0) ~ '^\d{4}-\d{2}-\d{2}$' and (r->>4) ~ '^-?\d+(\.\d+)?$' and coalesce(r->>5, '') <> ''
    and not exists (select 1 from audit_txns x where x.source = 'register' and x.business_id = b and x.fingerprint = r->>5);
  get diagnostics n = row_count;
  update audit_files a set rows = (select count(*) from audit_txns t where t.file_id = f),
    date_from = (select min(txn_date) from audit_txns t where t.file_id = f), date_to = (select max(txn_date) from audit_txns t where t.file_id = f),
    uploaded_at = now()
  where a.id = f;
  return n;
end $$;
