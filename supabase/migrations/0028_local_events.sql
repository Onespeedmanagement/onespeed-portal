-- Local events (University of Delaware calendar, Blue Hens home games, etc.) for the Schedule Assistant.
-- Sources: udel.edu/academics/registrar/calendar, bluehens.com 2026 football schedule + promotions,
-- udel.edu Parents & Family Weekend and Homecoming pages (pulled Oct 28, 2026).

-- Which stores feel UD events (Newark stores by default; change on the Local events page)
alter table businesses add column if not exists ud_area boolean not null default false;
create or replace view stores with (security_invoker = true) as
  select b.* from businesses b join portfolios p on p.id = b.portfolio_id where p.kind = 'retail';
grant select on stores to authenticated;
update businesses set ud_area = true where name ilike 'University%' or name ilike 'Fairfield%';

create table if not exists local_events (
  id          uuid primary key default gen_random_uuid(),
  start_date  date not null,
  end_date    date not null,
  name        text not null,
  -- game = home football game, homecoming, family = Parents & Family Weekend,
  -- campus = students around and celebrating (move-in, last day of classes, commencement, alumni weekend),
  -- away = students leave (breaks), note = good to know, little effect expected
  kind        text not null check (kind in ('game', 'homecoming', 'family', 'campus', 'away', 'note')),
  detail      text,                         -- kickoff time, opponent, etc.
  scope       text not null default 'ud' check (scope in ('ud', 'all')),   -- ud = stores near UD only
  source      text,
  created_at  timestamptz not null default now(),
  check (end_date >= start_date)
);
create index if not exists local_events_dates on local_events (start_date, end_date);
alter table local_events enable row level security;
drop policy if exists read_all on local_events;
create policy read_all on local_events for select to authenticated using (true);
drop policy if exists admin_all on local_events;
create policy admin_all on local_events for all using (is_admin()) with check (is_admin());

insert into local_events (start_date, end_date, name, kind, detail, source) values
  -- Fall 2026 (past ones let the portal measure how much these days move sales)
  ('2026-08-21', '2026-08-24', 'UD move-in & orientation',              'campus',     'Students arrive; orientation Mon Aug 24', 'UD academic calendar'),
  ('2026-08-25', '2026-08-25', 'UD classes begin',                       'campus',     null, 'UD academic calendar'),
  ('2026-09-03', '2026-09-03', 'UD home football vs Merrimack',          'game',       'Thu 7:00 pm kickoff', 'bluehens.com'),
  ('2026-09-19', '2026-09-19', 'UD home football vs Coastal Carolina',   'game',       'Sat 11:30 am kickoff', 'bluehens.com'),
  ('2026-10-02', '2026-10-04', 'UD Parents & Family Weekend',            'family',     'Families in town Fri–Sun', 'udel.edu'),
  ('2026-10-02', '2026-10-02', 'UD home football vs Liberty',            'game',       'Fri 7:00 pm kickoff (Family Weekend, Blue Out)', 'bluehens.com'),
  ('2026-10-20', '2026-10-20', 'UD home football vs Missouri State',     'game',       'Tue 7:00 pm kickoff (Senior Day)', 'bluehens.com'),
  ('2026-11-03', '2026-11-03', 'Election Day: UD classes suspended',     'note',       null, 'UD academic calendar'),
  ('2026-11-13', '2026-11-14', 'UD Homecoming weekend',                  'homecoming', 'Alumni reunions; tailgate Sat 1 pm', 'udel.edu'),
  ('2026-11-14', '2026-11-14', 'UD Homecoming game vs FIU',              'game',       'Sat 3:00 pm kickoff', 'bluehens.com'),
  ('2026-11-21', '2026-11-29', 'UD Thanksgiving break: students away',   'away',       'Break begins after classes Fri Nov 20; classes resume Mon Nov 30', 'UD academic calendar'),
  ('2026-11-28', '2026-11-28', 'UD home football vs Jacksonville State', 'game',       'Sat 3:30 pm kickoff (during Thanksgiving break)', 'bluehens.com'),
  ('2026-12-08', '2026-12-08', 'UD last day of fall classes',            'campus',     'Classes end 10 pm', 'UD academic calendar'),
  ('2026-12-09', '2026-12-14', 'UD reading day & final exams',           'note',       'Finals end Mon Dec 14', 'UD academic calendar'),
  ('2026-12-15', '2027-01-03', 'UD winter break: students away',         'away',       null, 'UD academic calendar'),
  -- Winter / Spring 2027
  ('2027-01-04', '2027-01-04', 'UD winter session begins',               'note',       'Smaller student population through Feb 6', 'UD academic calendar'),
  ('2027-02-05', '2027-02-08', 'UD students return for spring',          'campus',     'Spring classes begin Mon Feb 8', 'UD academic calendar'),
  ('2027-03-27', '2027-04-04', 'UD spring break: students away',         'away',       'Classes resume Mon Apr 5', 'UD academic calendar'),
  ('2027-05-20', '2027-05-20', 'UD last day of spring classes',          'campus',     'Classes end 10 pm', 'UD academic calendar'),
  ('2027-05-22', '2027-05-26', 'UD final exams',                         'note',       null, 'UD academic calendar'),
  ('2027-05-29', '2027-05-29', 'UD Commencement',                        'campus',     'Graduates and families in town', 'UD academic calendar'),
  ('2027-06-04', '2027-06-06', 'UD Alumni Weekend',                      'campus',     null, 'UD academic calendar');
