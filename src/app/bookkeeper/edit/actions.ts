'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { toCents } from '@/lib/format';
import { todayNY } from '@/lib/dates';

export type EditState = { ok?: string; error?: string };
const FIELDS = [['total_sales', 'Total sales'], ['card_sales', 'Card sales'], ['cash_sales', 'Cash sales (net cash-flow)']] as const;

// Bookkeeper types a day's sales numbers by hand. The old and new numbers are logged
// and the day is flagged for the admins.
export async function editDay(_p: EditState, form: FormData): Promise<EditState> {
  const me = await requireRole('bookkeeper');
  const businessId = String(form.get('business_id') || '');
  const date = String(form.get('business_date') || '');
  const reason = String(form.get('reason') || '').trim();
  if (!businessId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date >= todayNY()) return { error: 'Pick a store and a past day.' };
  if (!reason) return { error: 'Say why the numbers are being changed (the admins will see it).' };

  const next: Record<string, number | null> = {};
  for (const [k, label] of FIELDS) {
    const raw = String(form.get(k) ?? '').trim();
    const v = toCents(raw);
    if (raw === '' || Number.isNaN(v) || v < 0) return { error: `${label} must be a dollar amount.` };
    next[k] = v;
  }
  const custRaw = String(form.get('transactions') ?? '').trim();
  const customers = custRaw === '' ? null : Number(custRaw.replace(/,/g, ''));
  if (customers != null && (!Number.isInteger(customers) || customers < 0)) return { error: 'Customers must be a whole number.' };
  next.transactions = customers;

  const supabase = await supabaseServer();
  const { data: before } = await supabase.from('pos_daily').select('total_sales, card_sales, cash_sales, transactions')
    .eq('business_id', businessId).eq('business_date', date).maybeSingle();
  const same = before && FIELDS.every(([k]) => Number(before[k]) === next[k]) && (before.transactions ?? null) === next.transactions;
  if (same) return { ok: 'No changes.' };

  const note = `Edited by hand by ${me.email}: ${reason}`;
  const { error } = await supabase.from('pos_daily').upsert({
    business_id: businessId, business_date: date, ...next,
    override_note: note, override_by: me.email, updated_at: new Date().toISOString(),
  });
  if (error) return { error: 'Couldn’t save the numbers.' };
  await supabase.from('pos_changes').insert({ business_id: businessId, business_date: date, changed_by: me.email, before: before ?? null, after: { ...next, reason } });
  revalidatePath('/bookkeeper');
  revalidatePath('/bookkeeper/edit');
  return { ok: 'Saved. Ujash and Vrajesh will see the change on Discrepancies.' };
}

const CASH = [['cash_counted', 'Cash counted'], ['paid_out', 'Cash paid out'], ['petty_change', 'Petty change taken'], ['held_for_next', 'Held for next deposit']] as const;

// Bookkeeper corrects (or fills in) the manager's cash close-out for a day.
export async function editCloseout(_p: EditState, form: FormData): Promise<EditState> {
  const me = await requireRole('bookkeeper');
  const businessId = String(form.get('business_id') || '');
  const date = String(form.get('business_date') || '');
  const reason = String(form.get('reason') || '').trim();
  if (!businessId || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date >= todayNY()) return { error: 'Pick a store and a past day.' };
  if (!reason) return { error: 'Say why the cash is being changed (the admins will see it).' };

  const next: Record<string, number | string | null> = {};
  for (const [k, label] of CASH) {
    const raw = String(form.get(k) ?? '').trim();
    const v = raw === '' && k !== 'cash_counted' ? 0 : toCents(raw);
    if (Number.isNaN(v) || v < 0) return { error: `${label} must be a dollar amount.` };
    next[k] = v;
  }
  next.paid_out_reason = String(form.get('paid_out_reason') || '').trim() || null;
  if (Number(next.held_for_next) > Number(next.cash_counted)) return { error: 'Held for next deposit can’t be more than the cash counted.' };

  const supabase = await supabaseServer();
  const { data: before } = await supabase.from('closeouts')
    .select('id, cash_counted, paid_out, paid_out_reason, petty_change, held_for_next')
    .eq('business_id', businessId).eq('business_date', date).maybeSingle();
  const same = before && CASH.every(([k]) => Number(before[k]) === next[k]) && (before.paid_out_reason ?? null) === next.paid_out_reason;
  if (same) return { ok: 'No changes.' };

  const note = `Cash corrected by ${me.email}: ${reason}`;
  const { error } = before
    ? await supabase.from('closeouts').update({ ...next, note }).eq('id', before.id)
    : await supabase.from('closeouts').insert({ business_id: businessId, business_date: date, ...next, note, submitted_by: me.email });
  if (error) return { error: 'Couldn’t save the cash numbers.' };
  const prev = before ? Object.fromEntries(Object.entries(before).filter(([k]) => k !== 'id')) : null;
  await supabase.from('pos_changes').insert({ business_id: businessId, business_date: date, changed_by: me.email, kind: 'cash',
    before: prev, after: { ...next, reason } });
  revalidatePath('/bookkeeper');
  revalidatePath('/bookkeeper/edit');
  return { ok: 'Saved. The short/over is recalculated, and Ujash and Vrajesh will see the change on Discrepancies.' };
}
