'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { ingestPosPdf, type IngestResult } from '@/lib/pos/ingest';

// Bookkeeper: add POS reports for days that don't have one yet (any store). Never replaces a day.
export async function bookkeeperUpload(_prev: IngestResult[], form: FormData): Promise<IngestResult[]> {
  await requireRole('bookkeeper');
  const supabase = await supabaseServer();
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  if (files.length > 40) return [{ filename: '', status: 'error', message: 'Upload at most 40 files at a time.' }];
  const results: IngestResult[] = [];
  for (const f of files) {
    if (!/\.pdf$/i.test(f.name)) { results.push({ filename: f.name, status: 'error', message: 'Only POS PDF reports are accepted.' }); continue; }
    results.push(await ingestPosPdf(supabase, new Uint8Array(await f.arrayBuffer()), f.name, 'upload', undefined, { noReplace: true }));
  }
  revalidatePath('/bookkeeper');
  return results;
}
