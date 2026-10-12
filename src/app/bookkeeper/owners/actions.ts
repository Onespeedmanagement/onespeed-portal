'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { toCents } from '@/lib/format';

export type FormState = { ok?: string; error?: string };

export async function saveBalance(_p: FormState, form: FormData): Promise<FormState> {
  await requireRole('bookkeeper');
  const balance = toCents(String(form.get('qb_balance') ?? ''));
  if (form.get('qb_balance') === '' || Number.isNaN(balance)) return { error: 'Enter the QB balance as a dollar amount.' };
  const supabase = await supabaseServer();
  const { error } = await supabase.from('owners_report').upsert({
    business_id: String(form.get('business_id')), business_date: String(form.get('business_date')),
    qb_balance: balance, balance_status: String(form.get('balance_status') || 'good'),
    entered_by: (await supabase.auth.getUser()).data.user?.email, entered_at: new Date().toISOString(),
  });
  if (error) return { error: 'Couldn’t save the balance.' };
  revalidatePath('/bookkeeper/owners');
  return { ok: 'Balance saved.' };
}

export async function addLine(_p: FormState, form: FormData): Promise<FormState> {
  await requireRole('bookkeeper');
  const supabase = await supabaseServer();
  const type = String(form.get('line_type'));
  let distributorId: string | null = String(form.get('distributor_id') || '') || null;
  const newDist = String(form.get('new_distributor') || '').trim();
  if (type === 'distributor_check' && newDist) {
    const { data, error } = await supabase.from('distributors').upsert({ name: newDist }, { onConflict: 'name' }).select('id').single();
    if (error) return { error: 'Couldn’t add the distributor.' };
    distributorId = data.id;
  }
  if (type === 'distributor_check' && !distributorId) return { error: 'Pick or add the distributor.' };
  const debit = toCents(String(form.get('debit') ?? ''));
  const credit = toCents(String(form.get('credit') ?? ''));
  if (Number.isNaN(debit) || Number.isNaN(credit) || (debit === 0 && credit === 0)) return { error: 'Enter a debit or a credit amount.' };
  let memo = String(form.get('memo') || '').trim();
  if (!memo && distributorId) {
    const { data } = await supabase.from('distributors').select('name').eq('id', distributorId).single();
    memo = data?.name ?? '';
  }
  if (!memo) return { error: 'Enter a memo or payee.' };
  const { error } = await supabase.from('ledger_lines').insert({
    business_id: String(form.get('business_id')), business_date: String(form.get('business_date')),
    memo, line_type: type, distributor_id: type === 'distributor_check' ? distributorId : null,
    check_number: String(form.get('check_number') || '') || null, check_date: String(form.get('check_date') || '') || null,
    debit, credit,
  });
  if (error) return { error: 'Couldn’t add the line.' };
  revalidatePath('/bookkeeper/owners');
  return { ok: 'Line added.' };
}

export async function deleteLine(form: FormData) {
  await requireRole('bookkeeper');
  const supabase = await supabaseServer();
  await supabase.from('ledger_lines').delete().eq('id', String(form.get('id')));
  revalidatePath('/bookkeeper/owners');
}
