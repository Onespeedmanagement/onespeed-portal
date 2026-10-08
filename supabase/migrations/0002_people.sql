-- Test store: Christiana Wine & Spirits manager
insert into app_users (email, display_name, role)
values ('cwsmanagement1101@gmail.com', 'Christiana manager', 'manager')
on conflict (email) do nothing;

insert into business_access (email, business_id)
select 'cwsmanagement1101@gmail.com', id from businesses where name = 'Christiana Wine & Spirits'
on conflict do nothing;
