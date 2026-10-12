'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

export async function resolveItem(form: FormData) {
  await requireRole('admin');
  const supabase = await supabaseServer();
  const kind = String(form.get('kind'));
  const note = String(form.get('note') || '').trim() || null;
  if (kind === 'question') {
    await supabase.from('questions').update({ resolved: true, resolved_at: new Date().toISOString(), admin_note: note,
      resolved_by: (await supabase.auth.getUser()).data.user?.email ?? null }).eq('id', String(form.get('ref')));
  } else {
    await supabase.from('resolutions').upsert({
      business_id: String(form.get('business_id')), business_date: String(form.get('business_date')),
      kind, ref: String(form.get('ref') || ''), note,
    });
  }
  revalidatePath('/discrepancies');
}
