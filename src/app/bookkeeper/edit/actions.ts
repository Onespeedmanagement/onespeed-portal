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
