import type { SupabaseClient } from '@supabase/supabase-js';

export type PosRow = { business_id: string; business_date: string; total_sales: number | null; profit: number | null; transactions: number | null };
export type Totals = { sales: number; profit: number; customers: number; days: number; margin: number | null; ticket: number | null };
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

export function total(rows: PosRow[], businessId: string, from: string, to: string): Totals {
  const r = rows.filter((x) => x.business_id === businessId && x.business_date >= from && x.business_date <= to);
  const sales = r.reduce((a, x) => a + Number(x.total_sales ?? 0), 0);
  const profit = r.reduce((a, x) => a + Number(x.profit ?? 0), 0);
  const customers = r.reduce((a, x) => a + Number(x.transactions ?? 0), 0);
  return { sales, profit, customers, days: r.length, margin: sales ? (profit / sales) * 100 : null, ticket: customers ? sales / customers : null };
}

export const value = (t: Totals, m: Metric): number | null =>
  t.days === 0 ? null : m === 'sales' ? t.sales : m === 'customers' ? t.customers : m === 'ticket' ? t.ticket : t.margin;

export function change(cur: Totals, prev: Totals, m: Metric): { text: string; dir: 'up' | 'down' | 'flat' | 'none' } {
  const a = value(cur, m), b = value(prev, m);
  if (a == null || b == null || (m !== 'margin' && b === 0)) return { text: 'No data yet', dir: 'none' };
  if (m === 'margin') { const d = a - b; return { text: `${d >= 0 ? '▲' : '▼'} ${Math.abs(d).toFixed(2)} pts`, dir: d > 0 ? 'up' : d < 0 ? 'down' : 'flat' }; }
  const pct = ((a - b) / b) * 100;
  return { text: `${pct >= 0 ? '▲' : '▼'} ${Math.abs(pct).toFixed(1)}%`, dir: pct > 0 ? 'up' : pct < 0 ? 'down' : 'flat' };
}

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const usd2 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
export function fmt(t: Totals, m: Metric): string {
  const v = value(t, m);
  if (v == null) return '—';
  return m === 'sales' ? usd.format(v) : m === 'customers' ? Math.round(v).toLocaleString('en-US') : m === 'ticket' ? usd2.format(v) : `${v.toFixed(2)}%`;
}
export const METRIC_LABEL: Record<Metric, string> = { sales: 'Revenue', customers: 'Customers', ticket: 'Avg ticket', margin: 'Margin' };
