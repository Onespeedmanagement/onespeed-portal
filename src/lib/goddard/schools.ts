import type { SupabaseClient } from '@supabase/supabase-js';

export type Line = { label: string; amount: number };
export type SchoolMonth = {
  business_id: string; month: string; tuition: Line[]; other_fees: Line[];
  tuition_total: number | null; other_total: number | null; revenue: number | null; cash_receipts: number | null;
  preschool_rate: number | null; not_subject: number | null; royalties_due: number | null; marketing_due: number | null;
  expenses: Line[]; total_opex: number | null; operating_income: number | null; capex: number | null; debt_service: number | null;
  explanations: string | null; report_date: string | null; filename: string | null; uploaded_by: string; uploaded_at: string;
};

export const FILE_KINDS: Record<string, string> = {
  financial: 'FMS Monthly Financial Report',
  forecast: 'Monthly Forecasted Billing',
  new_enrollments: 'New families starting next month',
  ar_ledger: 'A/R Ledger',
  deposits: 'Deposit History',
  other: 'Other',
};

// Schools = active businesses in a portfolio of kind 'school' (that the viewer may see)
export async function loadSchools(supabase: SupabaseClient, includeInactive = false) {
  const { data: pfs } = await supabase.from('portfolios').select('id, name').eq('kind', 'school');
  const ids = (pfs ?? []).map((p) => p.id);
  if (!ids.length) return { portfolio: null as { id: string; name: string } | null, schools: [] as { id: string; name: string; pos_match: string | null; active: boolean }[] };
  let q = supabase.from('businesses').select('id, name, pos_match, active').in('portfolio_id', ids).order('name');
  if (!includeInactive) q = q.eq('active', true);
  const { data } = await q;
  return { portfolio: pfs![0], schools: data ?? [] };
}

const n = (v: unknown) => (v == null ? null : Number(v));
export function toMonth(r: Record<string, unknown>): SchoolMonth {
  const lines = (v: unknown) => ((v ?? []) as Line[]).map((l) => ({ label: l.label, amount: Number(l.amount) }));
  return {
    ...(r as unknown as SchoolMonth),
    tuition: lines(r.tuition), other_fees: lines(r.other_fees), expenses: lines(r.expenses),
    tuition_total: n(r.tuition_total), other_total: n(r.other_total), revenue: n(r.revenue), cash_receipts: n(r.cash_receipts),
    preschool_rate: n(r.preschool_rate), not_subject: n(r.not_subject), royalties_due: n(r.royalties_due), marketing_due: n(r.marketing_due),
    total_opex: n(r.total_opex), operating_income: n(r.operating_income), capex: n(r.capex), debt_service: n(r.debt_service),
  };
}

export async function loadMonths(supabase: SupabaseClient, ids: string[], from: string, to: string): Promise<SchoolMonth[]> {
  if (!ids.length) return [];
  const { data } = await supabase.from('school_months').select('*').in('business_id', ids).gte('month', from).lte('month', to).order('month');
  return (data ?? []).map((r) => toMonth(r as Record<string, unknown>));
}

// Cash left after operating costs, debt payments and capital spending
export const afterDebt = (m: SchoolMonth) => m.operating_income == null ? null : m.operating_income - (m.debt_service ?? 0) - (m.capex ?? 0);
export const margin = (m: SchoolMonth) => (m.revenue && m.operating_income != null ? (m.operating_income / m.revenue) * 100 : null);
export const collected = (m: SchoolMonth) => (m.revenue && m.cash_receipts != null ? (m.cash_receipts / m.revenue) * 100 : null);

export const addMonthsIso = (iso: string, k: number) => {
  const d = new Date(`${iso.slice(0, 7)}-01T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + k);
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`;
};
export const monthName = (iso: string, style: 'long' | 'short' = 'long') =>
  new Date(`${iso.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('en-US', { month: style, year: 'numeric', timeZone: 'UTC' });

export function pct(a: number | null, b: number | null): { text: string; dir: 'up' | 'down' | 'flat' | 'none' } {
  if (a == null || b == null || b === 0) return { text: '—', dir: 'none' };
  const p = ((a - b) / Math.abs(b)) * 100;
  return { text: `${p >= 0 ? '▲' : '▼'} ${Math.abs(p).toFixed(1)}%`, dir: p > 0 ? 'up' : p < 0 ? 'down' : 'flat' };
}
