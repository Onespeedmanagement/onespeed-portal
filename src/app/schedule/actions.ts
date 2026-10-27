'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { parseWhenIWork } from '@/lib/schedule/parseWhenIWork';

export type SchedState = { ok?: string; error?: string };

export async function uploadSchedule(_p: SchedState, form: FormData): Promise<SchedState> {
  await requireRole('admin', 'manager');
  const businessId = String(form.get('business_id') ?? '');
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose the schedule file first.' };
  if (file.size > 5 * 1024 * 1024) return { error: 'That file is over 5 MB.' };
  if (!/\.(xlsx|xls|csv)$/i.test(file.name)) return { error: 'Upload the When I Work schedule exported to Excel (.xlsx). A PDF can’t be read.' };
  let s;
  try { s = parseWhenIWork(new Uint8Array(await file.arrayBuffer())); } catch (e) { return { error: (e as Error).message }; }

  const supabase = await supabaseServer();
  const { data: store } = await supabase.from('stores').select('id, name').eq('id', businessId).maybeSingle();
  if (!store) return { error: 'Pick your store.' };
  // Replace whatever was there for those days
  await supabase.from('schedule_shifts').delete().eq('business_id', store.id).gte('shift_date', s.from).lte('shift_date', s.to);
  const { error } = await supabase.from('schedule_shifts').insert(s.shifts.map((x) => ({ business_id: store.id, ...x })));
  if (error) return { error: `Couldn’t save the schedule: ${error.message}` };
  revalidatePath('/schedule');
  // Monday of the uploaded week
  const d = new Date(`${s.from}T12:00:00Z`); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  redirect(`/schedule?store=${store.id}&week=${d.toISOString().slice(0, 10)}&saved=${s.shifts.length}${s.openShifts ? `&open=${s.openShifts}` : ''}`);
}
