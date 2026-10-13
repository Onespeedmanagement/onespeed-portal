-- Max (cwsmanagement1101@) is the territory manager over every Wine & Spirits store.
-- Jacob is Christiana's store manager. Safe to run more than once.

update app_users set display_name = 'Max (territory manager)', role = 'manager', active = true
where email = 'cwsmanagement1101@gmail.com';

insert into business_access (email, business_id)
select 'cwsmanagement1101@gmail.com', b.id
from businesses b join portfolios p on p.id = b.portfolio_id
where p.name = 'Wine & Spirits' and b.active
on conflict do nothing;

insert into app_users (email, display_name, role)
values ('jtrusso66@gmail.com', 'Jacob (Christiana manager)', 'manager')
on conflict (email) do update set role = 'manager', active = true;

insert into business_access (email, business_id)
select 'jtrusso66@gmail.com', id from businesses where name ilike 'Christiana%'
on conflict do nothing;

-- Check
select u.display_name, u.email, string_agg(b.name, ', ' order by b.name) as stores
from app_users u
join business_access a on a.email = u.email
join businesses b on b.id = a.business_id
where u.role = 'manager'
group by u.display_name, u.email
order by u.display_name;
