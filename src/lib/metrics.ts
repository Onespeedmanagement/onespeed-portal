import type { SupabaseClient } from '@supabase/supabase-js';

export type PosRow = { business_id: string; business_date: string; total_sales: number | null; profit: number | null; transactions: number | null };
export type HistRow = { business_id: string; month: string; revenue: number; customers: number | null; profit_pct: number | null };
// est = part of a month's total spread evenly over days; hist = some of it came from monthly history
export type Totals = { sales: number; profit: number; customers: number; days: number; margin: number | null; ticket: number | null; est: boolean; hist: boolean };
export type Metric = 'sales' | 'customers' | 'ticket' | 'margin';

export async function loadPos(supabase: SupabaseClient, ids: string[], from: string, to: string): Promise<PosRow[]> {
  if (!ids.length) return [];
  const out: PosRow[] = [];
  for (let page = 0; ; page++) {
    const { data } = await supabase.from('pos_daily').select('business_id, business_date, total_sales, profit, transactions')
      .in('business_id', ids).gte('business_date', from).lte('business_date', to).order('business_date').range(page * 1000, page * 1000 + 999);
    out.push(...((data ?? []) as PosRow[]));
    if (!data || data.length < 1000) break;
  }
  return out;
}

export async function loadHistory(supabase: SupabaseClient, ids: string[], from: string, to: string): Promise<HistRow[]> {
  if (!ids.length) return [];
  const { data } = await supabase.from('monthly_history').select('business_id, month, revenue, customers, profit_pct')
    .in('business_id', ids).gte('month', `${from.slice(0, 7)}-01`).lte('month', to);
  return ((data ?? []) as HistRow[]).map((h) => ({ ...h, revenue: Number(h.revenue), customers: h.customers == null ? null : Number(h.customers), profit_pct: h.profit_pct == null ? null : Number(h.profit_pct) }));
}

const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 86400000;
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

// Adds up revenue etc. for a store and date range. Months the daily POS reports
// don't fully cover are taken from monthly history when it's there (pro-rated
// by days for a partial month, marked as an estimate).
export function total(rows: PosRow[], businessId: string, from: string, to: string, hist: HistRow[] = []): Totals {
  let sales = 0, profit = 0, customers = 0, days = 0, profitSales = 0, custSales = 0, est = false, usedHist = false;
  const addDaily = (r: PosRow[]) => {
    for (const x of r) {
      const s = Number(x.total_sales ?? 0);
      sales += s; days += 1;
      if (x.profit != null) { profit += Number(x.profit); profitSales += s; }
      if (x.transactions != null) { customers += Number(x.transactions); custSales += s; }
    }
  };
  const mine = rows.filter((x) => x.business_id === businessId && x.business_date >= from && x.business_date <= to);
  const myHist = hist.filter((h) => h.business_id === businessId);
  if (!myHist.length) addDaily(mine);
  else {
    let y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
    for (;;) {
      const mStart = `${y}-${String(m).padStart(2, '0')}-01`;
      if (mStart > to) break;
      const mEnd = `${y}-${String(m).padStart(2, '0')}-${lastDay(y, m)}`;
      const s = from > mStart ? from : mStart, e = to < mEnd ? to : mEnd;
      const span = dayNum(e) - dayNum(s) + 1;
      const daily = mine.filter((x) => x.business_date >= s && x.business_date <= e);
      const h = myHist.find((x) => x.month === mStart);
      if (!h || daily.length >= span) addDaily(daily);
      else {
        const f = span / lastDay(y, m);
        if (f < 1) est = true;
        usedHist = true;
        sales += h.revenue * f; days += span;
        if (h.profit_pct != null) { profit += h.revenue * f * h.profit_pct / 100; profitSales += h.revenue * f; }
        if (h.customers != null) { customers += h.customers * f; custSales += h.revenue * f; }
      }
      if (++m > 12) { m = 1; y++; }
    }
  }
  return {
    sales, profit, customers, days, est, hist: usedHist,
    margin: profitSales ? (profit / profitSales) * 100 : null,
    ticket: customers ? custSales / customers : null,
  };
}

export const value = (t: Totals, m: Metric): number | null =>
  t.days === 0 ? null : m === 'sales' ? t.sales : m === 'customers' ? t.customers : m === 'ticket' ? t.ticket : t.margin;

export function change(cur: Totals, prev: Totals, m: Metric): { text: string; dir: 'up' | 'down' | 'flat' | 'none' } {
  const a = value(cur, m), b = value(prev, m);
  if (a == null || b == null || (m !== 'margin' && b === 0)) return { text: 'No data yet', dir: 'none' };
  const approx = cur.est || prev.est ? '≈ ' : '';
  if (m === 'margin') { const d = a - b; return { text: `${approx}${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(2)} pts`, dir: d > 0 ? 'up' : d < 0 ? 'down' : 'flat' }; }
  const pct = ((a - b) / b) * 100;
  return { text: `${approx}${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%`, dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export function fmt(t: Totals, m: Metric): string {
  const v = value(t, m);
  if (v == null) return '—';
  const s = m === 'sales' ? usd.format(v) : m === 'customers' ? Math.round(v).toLocaleString('en-US') : m === 'ticket' ? usd2.format(v) : `${v.toFixed(2)}%`;
  return t.est ? `≈ ${s}` : s;
}
export const METRIC_LABEL: Record<Metric, string> = { sales: 'Revenue', customers: 'Customers', ticket: 'Avg ticket', margin: 'Margin' };
