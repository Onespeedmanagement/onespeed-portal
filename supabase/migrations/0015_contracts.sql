-- Contracts: insurance, trash, lease… with renewal/cancellation dates, the signed
-- contract files, and an email reminder 30 days (and 7 days) before the notice date.
-- Admins only. Safe to run more than once.

create table if not exists contracts (
  id             uuid primary key default gen_random_uuid(),
  business_id    uuid references businesses(id) on delete set null,   -- null = company-wide
  category       text not null,               -- Insurance, Trash, Lease, …
  vendor         text not null,
  description    text,
  start_date     date,
  end_date       date not null,               -- current term ends / renews
  notice_days    int  not null default 30,    -- notice required before end_date to cancel or renegotiate
  auto_renews    boolean not null default true,
  renewal_months int,                          -- length of each renewal term
  cost           numeric(12,2),
  cost_period    text check (cost_period in ('month', 'quarter', 'year', 'one-time')),
  remind_emails  text[] not null default '{}', -- which admins get the reminders
  status         text not null default 'active' check (status in ('active', 'cancelled', 'ended')),
  notes          text,
  created_by     text not null default me(),
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create table if not exists contract_files (
  id           uuid primary key default gen_random_uuid(),
  contract_id  uuid not null references contracts(id) on delete cascade,
  storage_path text not null,
  filename     text not null,
  uploaded_by  text not null default me(),
  uploaded_at  timestamptz not null default now()
);

-- One row per reminder sent, so the same one never goes out twice
create table if not exists contract_reminders_sent (
  contract_id uuid not null references contracts(id) on delete cascade,
  term_end    date not null,
  kind        text not null,                  -- '30' or '7'
  sent_at     timestamptz not null default now(),
  primary key (contract_id, term_end, kind)
);

alter table contracts enable row level security;
alter table contract_files enable row level security;
alter table contract_reminders_sent enable row level security;
drop policy if exists admin_all on contracts;
drop policy if exists admin_all on contract_files;
drop policy if exists admin_all on contract_reminders_sent;
create policy admin_all on contracts for all using (is_admin()) with check (is_admin());
create policy admin_all on contract_files for all using (is_admin()) with check (is_admin());
create policy admin_all on contract_reminders_sent for all using (is_admin()) with check (is_admin());

-- Private file storage for the signed contracts (admins only)
insert into storage.buckets (id, name, public) values ('contracts', 'contracts', false)
  on conflict (id) do nothing;
drop policy if exists contracts_admin_read on storage.objects;
drop policy if exists contracts_admin_write on storage.objects;
drop policy if exists contracts_admin_delete on storage.objects;
create policy contracts_admin_read on storage.objects for select using (bucket_id = 'contracts' and public.is_admin());
create policy contracts_admin_write on storage.objects for insert with check (bucket_id = 'contracts' and public.is_admin());
create policy contracts_admin_delete on storage.objects for delete using (bucket_id = 'contracts' and public.is_admin());
