import type { SupabaseClient } from '@supabase/supabase-js';

export type DayRow = {
  date: string;
  pos: { total_sales: number | null; card_sales: number | null; cash_sales: number | null; profit_pct: number | null } | null;
  closeout: {
    id: string; cash_counted: number; paid_out: number; paid_out_reason: string | null; petty_change: number;
    held_for_next: number; carried_in: number; difference: number | null; deposit_amount: number;
    submitted_by: string; note: string | null; deposit_date: string | null;
  } | null;
  employees: string[];
  status: 'matched' | 'short' | 'over' | 'waiting_pos' | 'missing_closeout' | 'no_data';
};

// One store, a range of days: POS totals + close-out + who was on the register.
export async function loadDays(supabase: SupabaseClient, businessId: string, from: string, to: string, tolerance: number): Promise<DayRow[]> {
  const [{ data: pos }, { data: cos }] = await Promise.all([
    supabase.from('pos_daily').select('business_date, total_sales, card_sales, cash_sales, profit_pct')
      .eq('business_id', businessId).gte('business_date', from).lte('business_date', to),
    supabase.from('closeout_results').select('id, business_date, cash_counted, paid_out, paid_out_reason, petty_change, held_for_next, carried_in, difference, deposit_amount, submitted_by, note, deposit_date')
      .eq('business_id', businessId).gte('business_date', from).lte('business_date', to),
  ]);
  const ids = (cos ?? []).map((c) => c.id);
  const { data: emps } = ids.length
    ? await supabase.from('closeout_employees').select('closeout_id, employees(name)').in('closeout_id', ids)
    : { data: [] };
  const names = new Map<string, string[]>();
  for (const e of (emps ?? []) as unknown as { closeout_id: string; employees: { name: string } | { name: string }[] | null }[]) {
    const emp = Array.isArray(e.employees) ? e.employees[0] : e.employees;
    if (!emp) continue;
    names.set(e.closeout_id, [...(names.get(e.closeout_id) ?? []), emp.name]);
  }
  const dates = new Set([...(pos ?? []).map((p) => p.business_date), ...(cos ?? []).map((c) => c.business_date)]);
  return [...dates].sort().reverse().map((date) => {
    const p = (pos ?? []).find((x) => x.business_date === date) ?? null;
    const c = (cos ?? []).find((x) => x.business_date === date) ?? null;
    let status: DayRow['status'] = 'no_data';
    if (c && c.difference == null) status = 'waiting_pos';
    else if (c) status = Math.abs(c.difference!) <= tolerance ? 'matched' : c.difference! < 0 ? 'short' : 'over';
    else if (p) status = 'missing_closeout';
    return {
      date,
      pos: p ? { total_sales: p.total_sales, card_sales: p.card_sales, cash_sales: p.cash_sales, profit_pct: p.profit_pct } : null,
      closeout: c ? { ...c } : null,
      employees: c ? names.get(c.id) ?? [] : [],
      status,
    };
  });
}

export async function getTolerance(supabase: SupabaseClient): Promise<number> {
  const { data } = await supabase.from('settings').select('value').eq('key', 'match_tolerance').maybeSingle();
  return Number(data?.value ?? 1);
}

export const STATUS_PILL: Record<DayRow['status'], [string, string]> = {
  matched: ['good', '✓ Matched'],
  short: ['bad', '✕ Short'],
  over: ['warn', '▲ Over'],
  waiting_pos: ['warn', 'Waiting for POS'],
  missing_closeout: ['bad', 'No close-out'],
  no_data: ['', '—'],
};
