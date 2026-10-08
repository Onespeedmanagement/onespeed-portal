'use server';
import { revalidatePath } from 'next/cache';
import { supabaseServer } from '@/lib/supabase/server';
import { requireRole } from '@/lib/auth';
import { toCents } from '@/lib/format';

export type FormState = { ok?: boolean; error?: string };

export async function submitCloseout(_prev: FormState, form: FormData): Promise<FormState> {
  const me = await requireRole('manager');
  const supabase = await supabaseServer();

  const businessId = String(form.get('business_id'));
  const businessDate = String(form.get('business_date'));
  const counted = toCents(form.get('cash_counted') as string);
  const paidOut = toCents(form.get('paid_out') as string);
  const petty = toCents(form.get('petty_change') as string);
  const held = toCents(form.get('held_for_next') as string);
  const reason = String(form.get('paid_out_reason') || '') || null;
  const note = String(form.get('note') || '').trim() || null;
  const employeeIds = form.getAll('employee_id').map(String);

  if (form.get('cash_counted') === '' || form.get('cash_counted') == null) return { error: 'Enter the cash counted.' };
  for (const [label, v] of [['Cash counted', counted], ['Cash paid out', paidOut], ['Petty change', petty], ['Held for next deposit', held]] as const) {
    if (Number.isNaN(v) || v < 0) return { error: `${label} must be a dollar amount.` };
  }
  if (paidOut > 0 && !reason) return { error: 'Pick what the cash was paid out for.' };
  if (held > counted) return { error: 'Held for next deposit can’t be more than the cash counted.' };

  // If the POS numbers are in and the day is short or over, someone must be named.
  const { data: pos } = await supabase.from('pos_daily').select('cash_sales')
    .eq('business_id', businessId).eq('business_date', businessDate).maybeSingle();
  const { data: tol } = await supabase.from('settings').select('value').eq('key', 'match_tolerance').maybeSingle();
  const tolerance = Number(tol?.value ?? 1);
  if (pos?.cash_sales != null) {
    const diff = Math.round((counted + paidOut + petty - Number(pos.cash_sales)) * 100) / 100;
    if (Math.abs(diff) > tolerance && employeeIds.length === 0) {
      return { error: 'The drawer is short or over. Pick who was on the register before submitting.' };
    }
  }

  const { data: row, error } = await supabase.from('closeouts').insert({
    business_id: businessId, business_date: businessDate, cash_counted: counted, paid_out: paidOut,
    paid_out_reason: reason, petty_change: petty, held_for_next: held, note, submitted_by: me.email,
  }).select('id').single();
  if (error) {
    if (error.code === '23505') return { error: 'Today’s close-out was already submitted. Ask an admin if it needs a change.' };
    return { error: 'Couldn’t save the close-out. Please try again.' };
  }
  if (employeeIds.length) {
    const { error: e2 } = await supabase.from('closeout_employees')
      .insert(employeeIds.map((employee_id) => ({ closeout_id: row.id, employee_id })));
    if (e2) return { error: 'Close-out saved, but the employees didn’t save. Tell an admin.' };
  }
  await supabase.from('audit_log').insert({ action: 'closeout.submitted', details: { businessId, businessDate } });
  revalidatePath('/closeout');
  return { ok: true };
}

export async function addEmployee(_prev: FormState, form: FormData): Promise<FormState> {
  await requireRole('manager');
  const supabase = await supabaseServer();
  const name = String(form.get('name') || '').trim();
  const businessId = String(form.get('business_id'));
  if (!name) return { error: 'Type the employee’s name.' };
  const { data, error } = await supabase.from('employees').insert({ business_id: businessId, name }).select('id').single();
  if (error) return { error: 'Couldn’t add the employee.' };
  await supabase.from('employee_changes').insert({ employee_id: data.id, action: 'added', new_name: name });
  revalidatePath('/closeout');
  return { ok: true };
}

export async function renameEmployee(id: string, newName: string, oldName: string): Promise<FormState> {
  await requireRole('manager');
  const name = newName.trim();
  if (!name) return { error: 'Name can’t be empty.' };
  const supabase = await supabaseServer();
  const { error } = await supabase.from('employees').update({ name }).eq('id', id);
  if (error) return { error: 'Couldn’t rename.' };
  await supabase.from('employee_changes').insert({ employee_id: id, action: 'renamed', old_name: oldName, new_name: name });
  revalidatePath('/closeout');
  return { ok: true };
}

export async function removeEmployee(id: string, name: string): Promise<FormState> {
  await requireRole('manager');
  const supabase = await supabaseServer();
  const { error } = await supabase.from('employees').update({ active: false }).eq('id', id);
  if (error) return { error: 'Couldn’t remove.' };
  await supabase.from('employee_changes').insert({ employee_id: id, action: 'removed', old_name: name });
  revalidatePath('/closeout');
  return { ok: true };
}
