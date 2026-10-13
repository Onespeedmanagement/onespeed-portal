import type { SupabaseClient } from '@supabase/supabase-js';

export const LINE_TYPES: Record<string, string> = {
  distributor_check: 'Distributor check', ach: 'ACH', tax: 'Tax', card_payment: 'Card payment', deposit: 'Deposit', other: 'Other',
};

export async function loadOwnersDay(supabase: SupabaseClient, businessId: string, date: string) {
  const [{ data: pos }, { data: co }, { data: rep }, { data: lines }] = await Promise.all([
    supabase.from('pos_daily').select('total_sales, profit, profit_pct, card_sales, cash_sales').eq('business_id', businessId).eq('business_date', date).maybeSingle(),
    supabase.from('closeout_results').select('cash_counted, paid_out, paid_out_reason, petty_change, held_for_next, difference, deposit_amount, note').eq('business_id', businessId).eq('business_date', date).maybeSingle(),
    supabase.from('owners_report').select('qb_balance, balance_status, entered_by, entered_at, bank_balance, outstanding_total, source').eq('business_id', businessId).eq('business_date', date).maybeSingle(),
    supabase.from('ledger_lines').select('id, memo, line_type, check_number, check_date, debit, credit, distributors(name)').eq('business_id', businessId).eq('business_date', date).order('entered_at'),
  ]);
  type Line = { id: string; memo: string; line_type: string; check_number: string | null; check_date: string | null; debit: number; credit: number; distributors: { name: string } | null };
  const ls = (lines ?? []) as unknown as Line[];
  const totals = { debit: ls.reduce((a, l) => a + Number(l.debit), 0), credit: ls.reduce((a, l) => a + Number(l.credit), 0) };
  return { pos, co, rep, lines: ls, totals };
}
