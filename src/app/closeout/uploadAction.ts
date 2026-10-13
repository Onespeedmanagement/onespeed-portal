'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { ingestPosPdf, type IngestResult } from '@/lib/pos/ingest';

type Supa = Awaited<ReturnType<typeof supabaseServer>>;

// The manager's store and which days (start date → yesterday) already have a report.
// The store must be one this manager is assigned to (only those are visible to them);
// dates come from the server, never from the form.
async function context(supabase: Supa, wanted: FormDataEntryValue | null) {
  const { data: stores } = await supabase.from('businesses').select('id, name').eq('active', true).order('name');
  const store = stores?.find((s) => s.id === String(wanted ?? '')) ?? (stores?.length === 1 ? stores[0] : undefined);
  if (!store) return null;
  const { data } = await supabase.rpc('manager_report_days', { b: store.id });
  const days = (data ?? []) as { business_date: string; has_report: boolean }[];
  return {
    store,
    done: days.filter((d) => d.has_report).map((d) => d.business_date),
    missing: days.filter((d) => !d.has_report).map((d) => d.business_date),
  };
}

const pdfOnly = (f: File) => /\.pdf$/i.test(f.name);

// Upload on the close-out screen: the day being closed out only.
export async function uploadTodaysReport(_prev: IngestResult | null, form: FormData): Promise<IngestResult | null> {
  await requireRole('manager');
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { filename: '', status: 'error', message: 'Choose the PDF first.' };
  if (!pdfOnly(file)) return { filename: file.name, status: 'error', message: 'Upload the POS “Cash and Sales Summary” PDF.' };

  const supabase = await supabaseServer();
  const ctx = await context(supabase, form.get('business_id'));
  if (!ctx) return { filename: file.name, status: 'error', message: 'You aren’t assigned to a store.' };
  const { data: openRows } = await supabase.rpc('manager_open_dates', { b: ctx.store.id });
  const openDates = ((openRows ?? []) as unknown[]).map((r) => String(typeof r === 'object' && r ? Object.values(r)[0] : r));
  const businessDate = String(form.get('business_date') || '');
  if (!openDates.includes(businessDate)) return { filename: file.name, status: 'error', message: 'That day is closed. Ask an admin to upload it.' };

  const result = await ingestPosPdf(supabase, new Uint8Array(await file.arrayBuffer()), file.name, 'upload',
    { businessId: ctx.store.id, storeName: ctx.store.name, allowedDates: ctx.missing.includes(businessDate) ? [businessDate] : [], doneDates: ctx.done, closingOut: businessDate });
  revalidatePath('/closeout');
  return result;
}

// Catch-up: any number of past days' reports at once, each day only once.
export async function uploadMissingReports(_prev: IngestResult[], form: FormData): Promise<IngestResult[]> {
  await requireRole('manager');
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (!files.length) return [{ filename: '', status: 'error', message: 'Choose the PDFs first.' }];
  if (files.length > 40) return [{ filename: '', status: 'error', message: 'Upload at most 40 files at a time.' }];

  const supabase = await supabaseServer();
  const ctx = await context(supabase, form.get('business_id'));
  if (!ctx) return [{ filename: '', status: 'error', message: 'You aren’t assigned to a store.' }];

  const results: IngestResult[] = [];
  const done = [...ctx.done];
  for (const f of files) {
    if (!pdfOnly(f)) { results.push({ filename: f.name, status: 'error', message: 'Not a PDF.' }); continue; }
    const r = await ingestPosPdf(supabase, new Uint8Array(await f.arrayBuffer()), f.name, 'upload',
      { businessId: ctx.store.id, storeName: ctx.store.name, allowedDates: ctx.missing.filter((d) => !done.includes(d)), doneDates: done });
    if (r.status === 'processed' && r.businessDate) done.push(r.businessDate);
    results.push(r);
  }
  revalidatePath('/closeout');
  return results;
}
