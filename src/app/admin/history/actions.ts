'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { parseMonthlyReport } from '@/lib/history/parseMonthlyReport';
import { todayNY } from '@/lib/dates';

export type HistoryResult = {
  ok: boolean;
  message: string;
  stores: { code: string; store: string | null; months: number; range?: string; warnings: string[] }[];
};

// Column headings on the sheet → words in the store name
const ALIASES: Record<string, string[]> = {
  cws: ['christiana'],
  ff: ['fairfield'],
  up: ['university'],
};

export async function importHistory(_prev: HistoryResult | null, form: FormData): Promise<HistoryResult> {
  const me = await requireRole('admin');
  const file = form.get('file');
  const year = Number(form.get('year'));
  if (!(file instanceof File) || file.size === 0 || !/\.pdf$/i.test(file.name)) return { ok: false, message: 'Pick the report saved as a PDF.', stores: [] };
  if (!(year >= 2020 && year <= 2100)) return { ok: false, message: 'Pick the year the sheet is for.', stores: [] };

  let months;
  try {
    months = await parseMonthlyReport(new Uint8Array(await file.arrayBuffer()), year);
  } catch (e) {
    return { ok: false, message: `Couldn't read that PDF: ${(e as Error).message}`, stores: [] };
  }
  if (months.length === 0) return { ok: false, message: 'No monthly revenue found in that file. Is it the Monthly Store Performance Report?', stores: [] };
  const thisMonth = `${todayNY().slice(0, 7)}-01`;
  const future = months.find((m) => m.month > thisMonth);
  if (future) {
    const label = new Date(`${future.month}T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
    return { ok: false, message: `Nothing saved: with the year you picked, this sheet would have numbers for ${label}, which hasn't happened yet. Check which year "Current Yr" is on this sheet and pick that.`, stores: [] };
  }

  const supabase = await supabaseServer();
  const { data: businesses } = await supabase.from('businesses').select('id, name');
  const find = (code: string) => {
    const words = ALIASES[code.toLowerCase()] ?? [code.toLowerCase()];
    return (businesses ?? []).find((b) => words.some((w) => b.name.toLowerCase().includes(w))) ?? null;
  };

  const stores: HistoryResult['stores'] = [];
  for (const code of [...new Set(months.map((m) => m.code))]) {
    const list = months.filter((m) => m.code === code);
    const biz = find(code);
    const warnings = list.filter((m) => m.warning).map((m) => `${m.month.slice(0, 7)}: ${m.warning}`);
    if (!biz) {
      stores.push({ code, store: null, months: 0, warnings: [`No store matches "${code}". Add it under Stores, then upload this file again.`] });
      continue;
    }
    const { error } = await supabase.from('monthly_history').upsert(list.map((m) => ({
      business_id: biz.id, month: m.month, revenue: m.revenue, customers: m.customers, profit_pct: m.profitPct,
      source: file.name, updated_by: me.email, updated_at: new Date().toISOString(),
    })), { onConflict: 'business_id,month' });
    const short = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
    stores.push({ code, store: biz.name, months: error ? 0 : list.length, range: `${short(list[0].month)} – ${short(list[list.length - 1].month)}`, warnings: error ? [`Couldn't save: ${error.message}`, ...warnings] : warnings });
  }
  revalidatePath('/admin/history');
  revalidatePath('/dashboard');
  const saved = stores.reduce((a, s) => a + s.months, 0);
  return { ok: saved > 0, message: `Saved ${saved} months of totals.`, stores };
}
