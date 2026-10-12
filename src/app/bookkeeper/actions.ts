'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

export async function toggleEntered(businessId: string, date: string, entered: boolean) {
  await requireRole('bookkeeper');
  const supabase = await supabaseServer();
  await supabase.from('qb_marks').upsert({ business_id: businessId, business_date: date, entered });
  revalidatePath('/bookkeeper');
}

export async function askAdmin(form: FormData) {
  await requireRole('bookkeeper');
  const body = String(form.get('body') || '').trim();
  if (!body) return;
  const supabase = await supabaseServer();
  await supabase.from('questions').insert({ business_id: String(form.get('business_id')), business_date: String(form.get('business_date')), body });
  revalidatePath('/bookkeeper');
}
