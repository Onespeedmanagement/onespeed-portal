-- Days saved with 0% profit because the report's department table wasn't read:
-- mark profit as "not in report" so the dashboard margin isn't dragged down.
-- Lists the days first so you can re-upload those PDFs. Safe to run more than once.
select b.name as store, p.business_date, p.total_sales
from pos_daily p join businesses b on b.id = p.business_id
where p.profit = 0 and coalesce(p.profit_pct, 0) = 0 and p.total_sales > 0
order by 1, 2;

update pos_daily set cost = null, profit = null, profit_pct = null
where profit = 0 and coalesce(profit_pct, 0) = 0 and total_sales > 0;
