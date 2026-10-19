'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

export type FormState = { ok?: string; error?: string };

export async function saveUser(_p: FormState, form: FormData): Promise<FormState> {
  const me = await requireRole('admin');
  const email = String(form.get('email') || '').trim().toLowerCase();
  const role = String(form.get('role'));
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { error: 'Enter a valid Google email address.' };
  if (!['admin', 'bookkeeper', 'manager', 'investor', 'school_bookkeeper', 'school_admin'].includes(role)) return { error: 'Pick a role.' };
  if (email === me.email && role !== 'admin') return { error: 'You can’t remove your own admin access.' };
  const businessIds = form.getAll('business_id').map(String);
  const scoped = role === 'manager' || role === 'investor' || role === 'school_bookkeeper';
  if (scoped && businessIds.length === 0) return { error: `Pick at least one ${role === 'manager' ? 'store' : role === 'school_bookkeeper' ? 'school' : 'business'}.` };

  const supabase = await supabaseServer();
  const { error } = await supabase.from('app_users').upsert({
    email, role, display_name: String(form.get('display_name') || '').trim() || null, active: true,
    can_see_sales: form.get('can_see_sales') === 'on', can_see_owners: form.get('can_see_owners') === 'on', can_see_cash: form.get('can_see_cash') === 'on',
  });
  if (error) return { error: 'Couldn’t save this person.' };
  await supabase.from('business_access').delete().eq('email', email);
  if (scoped) {
    const { error: e2 } = await supabase.from('business_access').insert(businessIds.map((business_id) => ({ email, business_id })));
    if (e2) return { error: 'Saved the person, but their access didn’t save. Try again.' };
  }
  await supabase.from('audit_log').insert({ action: 'user.saved', details: { email, role, businessIds } });
  revalidatePath('/admin/users');
  redirect('/admin/users?saved=' + encodeURIComponent(email));
}

export async function setActive(form: FormData) {
  const me = await requireRole('admin');
  const email = String(form.get('email'));
  const active = form.get('active') === 'true';
  if (email === me.email) return;
  const supabase = await supabaseServer();
  await supabase.from('app_users').update({ active }).eq('email', email);
  await supabase.from('audit_log').insert({ action: active ? 'user.reactivated' : 'user.deactivated', details: { email } });
  revalidatePath('/admin/users');
}

export async function employeeAction(form: FormData) {
  await requireRole('admin');
  const supabase = await supabaseServer();
  const op = String(form.get('op'));
  const id = String(form.get('id') || '');
  const name = String(form.get('name') || '').trim();
  if (op === 'add' && name) {
    const { data } = await supabase.from('employees').insert({ business_id: String(form.get('business_id')), name }).select('id').single();
    if (data) await supabase.from('employee_changes').insert({ employee_id: data.id, action: 'added', new_name: name });
  } else if (op === 'rename' && id && name) {
    const old = String(form.get('old_name') || '');
    await supabase.from('employees').update({ name }).eq('id', id);
    await supabase.from('employee_changes').insert({ employee_id: id, action: 'renamed', old_name: old, new_name: name });
  } else if ((op === 'remove' || op === 'restore') && id) {
    await supabase.from('employees').update({ active: op === 'restore' }).eq('id', id);
    await supabase.from('employee_changes').insert({ employee_id: id, action: op === 'remove' ? 'removed' : 'restored', old_name: name });
  }
  revalidatePath('/admin/users');
}
