-- Items to push: the manager's short "focus" list for staff
alter table unsold_items add column if not exists focus boolean not null default false;
