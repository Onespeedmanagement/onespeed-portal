'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { toCents } from '@/lib/format';

export type ContractState = { ok?: string; error?: string };
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function readForm(form: FormData) {
  const s = (k: string) => String(form.get(k) ?? '').trim();
  const intOrNull = (k: string) => (s(k) === '' ? null : Number(s(k)));
  return {
    business_id: s('business_id') || null,
    portfolio_id: s('portfolio_id') || null,
    category: s('category') === 'Other' && s('category_other') ? s('category_other') : s('category'),
    vendor: s('vendor'),
    description: s('description') || null,
    start_date: s('start_date') || null,
    end_date: s('end_date'),
    notice_days: intOrNull('notice_days') ?? 30,
    auto_renews: form.get('auto_renews') === 'on',
    renewal_months: intOrNull('renewal_months'),
    cost: s('cost') === '' ? null : toCents(s('cost')),
    cost_period: s('cost_period') || null,
    remind_emails: form.getAll('remind_emails').map(String).filter(Boolean),
    notes: s('notes') || null,
  };
}

function check(c: ReturnType<typeof readForm>): string | null {
  if (!c.category) return 'Pick a category.';
  if (!c.vendor) return 'Enter the vendor or landlord.';
  if (!ISO.test(c.end_date)) return 'Enter the date the current term ends (or renews).';
  if (c.start_date && !ISO.test(c.start_date)) return 'Start date isn’t a valid date.';
  if (!Number.isInteger(c.notice_days) || c.notice_days < 0 || c.notice_days > 730) return 'Notice period must be a number of days.';
  if (c.renewal_months != null && (!Number.isInteger(c.renewal_months) || c.renewal_months < 1 || c.renewal_months > 120)) return 'Renewal term must be a number of months.';
  if (c.cost != null && Number.isNaN(c.cost)) return 'Cost must be a dollar amount.';
  if (c.auto_renews && !c.renewal_months) return 'For a contract that renews automatically, enter how many months each renewal lasts.';
  if (c.remind_emails.length === 0) return 'Pick at least one person to get the reminder.';
  if (!c.portfolio_id) return 'Couldn’t tell which business this contract is for. Reload the page and try again.';
  return null;
}

async function alignPortfolio(supabase: Awaited<ReturnType<typeof supabaseServer>>, c: ReturnType<typeof readForm>) {
  if (!c.business_id) return;
  const { data } = await supabase.from('businesses').select('portfolio_id').eq('id', c.business_id).maybeSingle();
  if (data?.portfolio_id) c.portfolio_id = data.portfolio_id;
}

export async function createContract(_p: ContractState, form: FormData): Promise<ContractState> {
  await requireRole('admin', 'school_admin');
  const c = readForm(form);
  const err = check(c);
  if (err) return { error: err };
  const supabase = await supabaseServer();
  await alignPortfolio(supabase, c);
  const { data, error } = await supabase.from('contracts').insert(c).select('id').single();
  if (error) return { error: 'Couldn’t save the contract.' };
  revalidatePath('/contracts');
  revalidatePath('/goddard/contracts');
  redirect(`/contracts/${data.id}?saved=1`);
}

export async function updateContract(_p: ContractState, form: FormData): Promise<ContractState> {
  await requireRole('admin', 'school_admin');
  const id = String(form.get('id') || '');
  const c = readForm(form);
  const err = check(c);
  if (err) return { error: err };
  const supabase = await supabaseServer();
  await alignPortfolio(supabase, c);
  const { error } = await supabase.from('contracts').update({ ...c, updated_at: new Date().toISOString() }).eq('id', id);
  if (error) return { error: 'Couldn’t save the changes.' };
  revalidatePath('/contracts');
  revalidatePath('/goddard/contracts');
  revalidatePath(`/contracts/${id}`);
  return { ok: 'Saved.' };
}

// The browser uploads the file straight to private storage (no size limit from the
// web server); this records it against the contract.
export async function recordFile(contractId: string, storagePath: string, filename: string): Promise<ContractState> {
  await requireRole('admin', 'school_admin');
  if (!storagePath.startsWith(`${contractId}/`) || storagePath.includes('..')) return { error: 'Upload failed.' };
  const supabase = await supabaseServer();
  const { error } = await supabase.from('contract_files').insert({ contract_id: contractId, storage_path: storagePath, filename: filename.slice(0, 200) });
  if (error) return { error: 'Uploaded, but couldn’t attach it to the contract.' };
  revalidatePath(`/contracts/${contractId}`);
  return { ok: 'Uploaded.' };
}

export async function deleteFile(form: FormData) {
  await requireRole('admin', 'school_admin');
  const supabase = await supabaseServer();
  const { data } = await supabase.from('contract_files').select('id, contract_id, storage_path').eq('id', String(form.get('file_id'))).maybeSingle();
  if (!data) return;
  await supabase.storage.from('contracts').remove([data.storage_path]);
  await supabase.from('contract_files').delete().eq('id', data.id);
  revalidatePath(`/contracts/${data.contract_id}`);
}

export async function setStatus(form: FormData) {
  await requireRole('admin', 'school_admin');
  const id = String(form.get('id') || '');
  const status = String(form.get('status') || '');
  if (!['active', 'cancelled', 'ended'].includes(status)) return;
  const supabase = await supabaseServer();
  await supabase.from('contracts').update({ status, updated_at: new Date().toISOString() }).eq('id', id);
  revalidatePath('/contracts');
  revalidatePath('/goddard/contracts');
  revalidatePath(`/contracts/${id}`);
}

export async function deleteContract(form: FormData) {
  await requireRole('admin', 'school_admin');
  const id = String(form.get('id') || '');
  const supabase = await supabaseServer();
  const { data: files } = await supabase.from('contract_files').select('storage_path').eq('contract_id', id);
  if (files?.length) await supabase.storage.from('contracts').remove(files.map((f) => f.storage_path));
  await supabase.from('contracts').delete().eq('id', id);
  revalidatePath('/contracts');
  revalidatePath('/goddard/contracts');
  const me = await requireRole('admin', 'school_admin');
  redirect(form.get('back') === 'goddard' || me.role === 'school_admin' ? '/goddard/contracts' : '/contracts');
}
