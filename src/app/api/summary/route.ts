import { NextResponse } from 'next/server';
import { secretOk, supabaseService } from '@/lib/supabase/service';
import { addDays, shortDate, todayNY } from '@/lib/dates';
import { holidayOn } from '@/lib/holidays';

export const runtime = 'nodejs';

const usd = (n: number | null | undefined) => (n == null ? '—' : new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(n));
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

// Morning summary for admins (and the missing-report check). Called by the Apps Script.
export async function GET(request: Request) {
  if (!secretOk(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supabase = supabaseService();
  const day = addDays(todayNY(), -1);
  const [{ data: stores }, { data: pos }, { data: cos }, { data: tol }, { data: qs }, { data: held }, { data: reps }] = await Promise.all([
    supabase.from('businesses').select('id, name, portfolio_id, portfolios(status)').eq('active', true).order('name'),
    supabase.from('pos_daily').select('business_id, total_sales, profit_pct, transactions').eq('business_date', day),
    supabase.from('closeout_results').select('business_id, difference').eq('business_date', day),
    supabase.from('settings').select('value').eq('key', 'match_tolerance').maybeSingle(),
    supabase.from('questions').select('id').eq('resolved', false),
    supabase.from('pos_files').select('id').in('status', ['held', 'unknown_store', 'error']).gte('received_at', `${addDays(day, -2)}T00:00:00Z`),
    supabase.from('owners_report').select('business_id').eq('business_date', addDays(day, -1)),
  ]);
  const tolerance = Number(tol?.value ?? 1);
  const live = (stores ?? []).filter((s) => (s as unknown as { portfolios: { status: string } | null }).portfolios?.status === 'live');
  const lines = live.map((s) => {
    const p = pos?.find((x) => x.business_id === s.id);
    const c = cos?.find((x) => x.business_id === s.id);
    const cash = !c ? 'No close-out yet' : c.difference == null ? 'Close-out in, waiting for POS'
      : Math.abs(c.difference) <= tolerance ? '✓ Cash matched' : `${c.difference < 0 ? '✕ Short' : '▲ Over'} ${usd(c.difference)}`;
    return { store: s.name, reported: !!p, sales: p?.total_sales ?? null, profit: p?.profit_pct ?? null, customers: p?.transactions ?? null, cash };
  });
  const missing = lines.filter((l) => !l.reported).map((l) => l.store);
  const issues = lines.filter((l) => /Short|Over|No close-out/.test(l.cash)).length + (qs?.length ?? 0) + (held?.length ?? 0) + missing.length;
  const h = holidayOn(day);
  const subject = `${missing.length ? '⚠ ' : ''}One Speed · ${shortDate(day)}: ${lines.length - missing.length} of ${lines.length} stores reported${issues ? ` · ${issues} to review` : ' · all clear'}`;
  const rows = lines.map((l) => `<tr><td style="padding:6px 10px;border-bottom:1px solid #eee"><b>${esc(l.store)}</b></td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${l.reported ? usd(l.sales) : '<span style="color:#a8431b">Missing</span>'}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${l.customers ?? '—'}</td><td style="padding:6px 10px;border-bottom:1px solid #eee;text-align:right">${l.profit != null ? l.profit + '%' : '—'}</td><td style="padding:6px 10px;border-bottom:1px solid #eee">${esc(l.cash)}</td></tr>`).join('');
  const portal = process.env.PORTAL_URL ?? 'https://onespeed-portal.vercel.app';
  const html = `<div style="font-family:Arial,sans-serif;color:#1c1f1d">
<h2 style="color:#1f3d2b;margin:0 0 4px">${esc(shortDate(day))}${h ? ` · ${esc(h.name)}` : ''}</h2>
<p style="margin:0 0 12px">${missing.length ? `<b style="color:#a8431b">Missing POS report: ${esc(missing.join(', '))}.</b> ` : 'All stores reported. '}
${issues ? `${issues} item(s) to review.` : 'Nothing to review.'}</p>
<table style="border-collapse:collapse;font-size:14px"><tr style="text-align:left;color:#555"><th style="padding:6px 10px">Store</th><th style="padding:6px 10px;text-align:right">Sales</th><th style="padding:6px 10px;text-align:right">Customers</th><th style="padding:6px 10px;text-align:right">Profit</th><th style="padding:6px 10px">Cash</th></tr>${rows}</table>
<p style="font-size:13px;color:#555">Open bookkeeper questions: ${qs?.length ?? 0} · POS files held: ${held?.length ?? 0} · Owners Report entered for ${reps?.length ?? 0} of ${lines.length} stores (day before).</p>
<p><a href="${portal}/discrepancies" style="color:#1f3d2b">Open Discrepancies</a> · <a href="${portal}/daily" style="color:#1f3d2b">Daily view</a></p></div>`;
  return NextResponse.json({ date: day, subject, html, missing, issues });
}
