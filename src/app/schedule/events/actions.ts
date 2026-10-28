'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

const KINDS = ['game', 'homecoming', 'family', 'campus', 'away', 'note'];
const isDate = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

export async function addEvent(form: FormData) {
  await requireRole('admin');
  const name = String(form.get('name') ?? '').trim();
  const start = String(form.get('start_date') ?? '');
  const end = String(form.get('end_date') ?? '') || start;
  const kind = String(form.get('kind') ?? '');
  const scope = form.get('scope') === 'all' ? 'all' : 'ud';
  if (!name || !isDate(start) || !isDate(end) || end < start || !KINDS.includes(kind)) redirect('/schedule/events?err=1');
  const supabase = await supabaseServer();
  const { error } = await supabase.from('local_events').insert({ name, start_date: start, end_date: end, kind, scope, detail: String(form.get('detail') ?? '').trim() || null, source: 'Added in portal' });
  if (error) redirect(`/schedule/events?err=${encodeURIComponent(error.message)}`);
  revalidatePath('/schedule');
  redirect('/schedule/events?ok=added');
}

export async function deleteEvent(form: FormData) {
  await requireRole('admin');
  const supabase = await supabaseServer();
  await supabase.from('local_events').delete().eq('id', String(form.get('id') ?? ''));
  revalidatePath('/schedule');
  redirect('/schedule/events?ok=removed');
}

export async function saveUdStores(form: FormData) {
  await requireRole('admin');
  const on = new Set(form.getAll('ud').map(String));
  const supabase = await supabaseServer();
  const { data: stores } = await supabase.from('stores').select('id');
  for (const s of stores ?? []) await supabase.from('businesses').update({ ud_area: on.has(s.id) }).eq('id', s.id);
  revalidatePath('/schedule');
  redirect('/schedule/events?ok=stores');
}
