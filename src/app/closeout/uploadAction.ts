'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { ingestPosPdf, type IngestResult } from '@/lib/pos/ingest';

// Temporary manager upload: their own store, open days only.
// Store and date come from the server, never from the form.
export async function uploadTodaysReport(_prev: IngestResult | null, form: FormData): Promise<IngestResult | null> {
  await requireRole('manager');
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { filename: '', status: 'error', message: 'Choose the PDF first.' };
  if (!/\.pdf$/i.test(file.name)) return { filename: file.name, status: 'error', message: 'Upload the POS “Cash and Sales Summary” PDF.' };

  const supabase = await supabaseServer();
  const { data: stores } = await supabase.from('businesses').select('id, name').eq('active', true).order('name');
  const store = stores?.[0];
  if (!store) return { filename: file.name, status: 'error', message: 'You aren’t assigned to a store.' };
  const { data: openRows } = await supabase.rpc('manager_open_dates', { b: store.id });
  const openDates = ((openRows ?? []) as unknown[]).map((r) => String(typeof r === 'object' && r ? Object.values(r)[0] : r));
  const businessDate = String(form.get('business_date') || '');
  if (!openDates.includes(businessDate)) {
    return { filename: file.name, status: 'error', message: 'That day is closed. Ask an admin to upload it.' };
  }

  const result = await ingestPosPdf(supabase, new Uint8Array(await file.arrayBuffer()), file.name, 'upload',
    { businessId: store.id, businessDate, storeName: store.name });
  revalidatePath('/closeout');
  return result;
}
