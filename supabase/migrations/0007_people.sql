-- Investor and store managers (safe to run more than once)

-- Pravin Patel: investor, University Liquor, sees sales + Owners Report + cash
insert into app_users (email, display_name, role, can_see_sales, can_see_owners, can_see_cash)
values ('mukhi04@gmail.com', 'Pravin Patel', 'investor', true, true, true)
on conflict (email) do update
  set role = 'investor', can_see_sales = true, can_see_owners = true, can_see_cash = true, active = true;

-- Store managers
insert into app_users (email, display_name, role) values
  ('anthony.fairfieldliquors@gmail.com', 'Fairfield manager (Anthony)', 'manager'),
  ('upmanager2023@gmail.com',            'University manager',          'manager'),
  ('suburbanliq@gmail.com',              'Suburban manager',            'manager')
on conflict (email) do update set role = 'manager', active = true;

-- Which store each person can see
insert into business_access (email, business_id)
select v.email, b.id
from (values
  ('mukhi04@gmail.com',                  'University%'),
  ('anthony.fairfieldliquors@gmail.com', 'Fairfield%'),
  ('upmanager2023@gmail.com',            'University%'),
  ('suburbanliq@gmail.com',              'Suburban%')
) v(email, store)
join businesses b on b.name ilike v.store
on conflict do nothing;

-- Suburban's nightly POS reports: match them by the word "Suburban" if no match is set yet
update businesses set pos_match = 'Suburban' where name ilike 'Suburban%' and coalesce(pos_match, '') = '';

-- Check: everyone and their store
select u.email, u.role, b.name as store, b.pos_match
from app_users u
left join business_access a on a.email = u.email
left join businesses b on b.id = a.business_id
order by u.role, b.name;
