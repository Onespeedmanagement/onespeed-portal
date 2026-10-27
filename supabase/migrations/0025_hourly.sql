-- Sales by hour from the nightly POS report, kept with each day (for the Employee Schedule Assistant)
alter table pos_daily add column if not exists hourly jsonb;   -- [{hour, count, amount}]
