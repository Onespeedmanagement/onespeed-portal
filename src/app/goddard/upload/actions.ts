'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { parseFms } from '@/lib/goddard/parseFms';
import { loadSchools, monthName } from '@/lib/goddard/schools';

export type FmsResult = {
  filename: string; status: 'saved' | 'updated' | 'held' | 'unknown_school' | 'error'; message: string;
  school?: string; schoolId?: string; month?: string; schoolName?: string; schoolNumber?: string | null;
  failed?: string[];
};

const usd = (n: number | null) => (n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));

export async function uploadFms(_prev: FmsResult[], form: FormData): Promise<FmsResult[]> {
  await requireRole('admin');
  const files = form.getAll('files').filter((f): f is File => f instanceof File && f.size > 0);
  const saveAnyway = form.get('save_anyway') === 'on';
  if (!files.length) return [{ filename: '', status: 'error', message: 'Choose the PDFs first.' }];
  if (files.length > 30) return [{ filename: '', status: 'error', message: 'Upload at most 30 files at a time.' }];
  const supabase = await supabaseServer();
  const { schools } = await loadSchools(supabase);
  const out: FmsResult[] = [];

  for (const f of files) {
    if (!/\.pdf$/i.test(f.name) && f.type !== 'application/pdf') { out.push({ filename: f.name, status: 'error', message: 'Not a PDF.' }); continue; }
    if (f.size > 4 * 1024 * 1024) { out.push({ filename: f.name, status: 'error', message: 'Over 4 MB. Is this the FMS Monthly Financial Report?' }); continue; }
    const bytes = new Uint8Array(await f.arrayBuffer());
    let r;
    try { r = await parseFms(bytes.slice()); } catch (e) { out.push({ filename: f.name, status: 'error', message: (e as Error).message }); continue; }

    // Match the school by its Goddard number "(#1230)" first, then by name
    const school = schools.find((s) => r.schoolNumber && (s.pos_match ?? '').replace(/\D/g, '') === r.schoolNumber)
      ?? schools.find((s) => r.schoolName && s.name.toLowerCase().includes(r.schoolName.split(',')[0].toLowerCase()));
    if (!school) {
      out.push({ filename: f.name, status: 'unknown_school', message: `This report is for ${r.schoolName} (#${r.schoolNumber ?? '?'}), which isn’t set up yet.`,
        schoolName: r.schoolName, schoolNumber: r.schoolNumber, month: r.month });
      continue;
    }
    const failed = r.checks.filter((c) => !c.ok).map((c) => `${c.name} (${c.detail})`);
    if (failed.length && !saveAnyway) {
      out.push({ filename: f.name, status: 'held', message: 'Not saved: the numbers on the report don’t add up. Check the report, or tick “save anyway”.',
        school: school.name, schoolId: school.id, month: r.month, failed });
      continue;
    }

    // Keep the original PDF
    const path = `${school.id}/${r.month.slice(0, 7)}/financial-${Date.now()}.pdf`;
    const { error: upErr } = await supabase.storage.from('school-reports').upload(path, bytes, { contentType: 'application/pdf' });

    const { data: existing } = await supabase.from('school_months').select('month').eq('business_id', school.id).eq('month', r.month).maybeSingle();
    const { error } = await supabase.from('school_months').upsert({
      business_id: school.id, month: r.month, tuition: r.tuition, other_fees: r.otherFees,
      tuition_total: r.tuitionTotal, other_total: r.otherTotal, revenue: r.revenue, cash_receipts: r.cashReceipts,
      preschool_rate: r.preschoolRate, not_subject: r.notSubject, royalties_due: r.royaltiesDue, marketing_due: r.marketingDue,
      expenses: r.expenses, total_opex: r.totalOpex, operating_income: r.operatingIncome, capex: r.capex, debt_service: r.debtService,
      explanations: r.explanations, report_date: r.reportDate, filename: f.name, storage_path: upErr ? null : path,
      uploaded_at: new Date().toISOString(),
    }, { onConflict: 'business_id,month' });
    if (error) { out.push({ filename: f.name, status: 'error', message: `Couldn’t save: ${error.message}` }); continue; }
    if (!upErr) await supabase.from('school_files').insert({ business_id: school.id, month: r.month, kind: 'financial', filename: f.name.slice(0, 200), storage_path: path });

    out.push({
      filename: f.name, status: existing ? 'updated' : 'saved', school: school.name, schoolId: school.id, month: r.month,
      message: `${monthName(r.month)}: revenue ${usd(r.revenue)} · operating income ${usd(r.operatingIncome)}${existing ? ' (replaced the earlier upload)' : ''}${failed.length ? ' · saved anyway' : ''}${upErr ? ' · the PDF itself didn’t store' : ''}`,
    });
  }
  revalidatePath('/goddard');
  return out;
}

// Add a school straight from an upload that named one we don't have yet
export async function addSchool(form: FormData) {
  await requireRole('admin');
  const supabase = await supabaseServer();
  const { portfolio } = await loadSchools(supabase, true);
  const number = String(form.get('number') ?? '').replace(/\D/g, '');
  const name = String(form.get('name') ?? '').trim();
  if (!portfolio || !name) return;
  await supabase.from('businesses').insert({ name, portfolio_id: portfolio.id, pos_match: number ? `#${number}` : null });
  revalidatePath('/goddard');
  revalidatePath('/goddard/upload');
}

// School reports kept as files (forecasted billing, A/R ledger, …): the browser uploads to storage, this records it
export async function recordSchoolFile(businessId: string, month: string, kind: string, storagePath: string, filename: string): Promise<{ ok?: string; error?: string }> {
  await requireRole('admin');
  if (!/^\d{4}-\d{2}-01$/.test(month) || !storagePath.startsWith(`${businessId}/`) || storagePath.includes('..')) return { error: 'Upload failed.' };
  if (!['forecast', 'new_enrollments', 'ar_ledger', 'deposits', 'other', 'financial'].includes(kind)) return { error: 'Pick the report type.' };
  const supabase = await supabaseServer();
  const { error } = await supabase.from('school_files').insert({ business_id: businessId, month, kind, storage_path: storagePath, filename: filename.slice(0, 200) });
  if (error) return { error: 'Uploaded, but couldn’t record it.' };
  revalidatePath(`/goddard/${businessId}`);
  return { ok: 'Uploaded.' };
}

export async function deleteSchoolFile(form: FormData) {
  await requireRole('admin');
  const supabase = await supabaseServer();
  const { data } = await supabase.from('school_files').select('id, business_id, storage_path').eq('id', String(form.get('id'))).maybeSingle();
  if (!data) return;
  await supabase.storage.from('school-reports').remove([data.storage_path]);
  await supabase.from('school_files').delete().eq('id', data.id);
  revalidatePath(`/goddard/${data.business_id}`);
}
