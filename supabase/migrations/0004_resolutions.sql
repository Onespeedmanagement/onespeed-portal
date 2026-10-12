-- Admins mark a discrepancy (short, over, missing close-out, held file) as resolved.
create table if not exists resolutions (
  business_id   uuid not null references businesses(id),
  business_date date not null,
  kind          text not null check (kind in ('short', 'over', 'missing_closeout', 'file')),
  ref           text not null default '',
  note          text,
  resolved_by   text not null default me(),
  resolved_at   timestamptz not null default now(),
  primary key (business_id, business_date, kind, ref)
);
alter table resolutions enable row level security;
create policy admin_all on resolutions for all using (is_admin()) with check (is_admin());

