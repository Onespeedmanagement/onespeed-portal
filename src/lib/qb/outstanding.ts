import type { SupabaseClient } from '@supabase/supabase-js';

export type Outstanding = { id: string; txn_date: string; ref_no: string | null; payee: string | null; memo: string | null; txn_type: string | null; amount: number; cleared_on: string | null };

// Payments outstanding on a report date: seen on an upload by then, and not cleared by then.
export async function loadOutstanding(supabase: SupabaseClient, businessId: string, date: string): Promise<Outstanding[]> {
  const { data } = await supabase.from('qb_outstanding')
    .select('id, txn_date, ref_no, payee, memo, txn_type, amount, cleared_on')
    .eq('business_id', businessId).lte('first_seen', date)
    .or(`cleared_on.is.null,cleared_on.gt.${date}`)
    .order('txn_date').order('payee');
  return ((data ?? []) as Outstanding[]).map((o) => ({ ...o, amount: Number(o.amount) }));
}

export async function trackFrom(supabase: SupabaseClient): Promise<string> {
  const { data } = await supabase.from('settings').select('value').eq('key', 'qb_track_from').maybeSingle();
  const v = data?.value;
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '2026-10-12';
}
