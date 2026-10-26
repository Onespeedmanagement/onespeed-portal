-- Audit flags become a to-do list: status, who's on it, and notes.
alter table audit_dismissed add column if not exists status text not null default 'ok';
alter table audit_dismissed drop constraint if exists audit_dismissed_status_check;
alter table audit_dismissed add constraint audit_dismissed_status_check check (status in ('open', 'checking', 'resolved', 'ok'));
alter table audit_dismissed add column if not exists assigned_to text;
alter table audit_dismissed add column if not exists saved numeric(12,2);      -- refund / saving achieved, if any
alter table audit_dismissed add column if not exists updated_at timestamptz not null default now();
