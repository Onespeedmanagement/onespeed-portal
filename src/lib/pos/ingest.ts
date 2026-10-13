import { createHash } from 'node:crypto';
import type { SupabaseClient } from '@supabase/supabase-js';
import { parseCashSalesSummary } from './parseCashSalesSummary';

export type IngestResult = {
  filename: string;
  status: 'processed' | 'duplicate' | 'held' | 'unknown_store' | 'error';
  store?: string;
  businessDate?: string;
  message: string;
};

// Reads one POS PDF and saves it, but only if it passes every check.
// The same file twice is ignored; a file that doesn't add up is held for an admin.
// `restrictTo` (manager uploads): the file must be for this store and one of the
// allowed dates, and each day can be uploaded only once. Nothing is written otherwise.
export type Restrict = { businessId: string; storeName: string; allowedDates: string[]; doneDates: string[]; closingOut?: string };
const niceDate = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
export async function ingestPosPdf(
  supabase: SupabaseClient, bytes: Uint8Array, filename: string, source: 'email' | 'upload',
  restrictTo?: Restrict,
  opts: { noReplace?: boolean } = {},   // bookkeeper: add missing days only, never replace one
): Promise<IngestResult> {
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  const { data: existing } = await supabase.from('pos_files').select('id').eq('sha256', sha256).maybeSingle();
  if (existing) return { filename, status: 'duplicate', message: 'Already received. Ignored.' };

  let parsed;
  try {
    parsed = await parseCashSalesSummary(bytes);
  } catch (e) {
    const message = `Couldn't read this file: ${(e as Error).message}`;
    if (!restrictTo) await supabase.from('pos_files').insert({ filename, sha256, source, status: 'error', message });
    return { filename, status: 'error', message };
  }

  if (restrictTo && restrictTo.doneDates.includes(parsed.businessDate)) {
    return { filename, status: 'duplicate', businessDate: parsed.businessDate,
      message: `${niceDate(parsed.businessDate)} is already uploaded. Each day can only be uploaded once; ask an admin if it needs replacing.` };
  }
  if (restrictTo && !restrictTo.allowedDates.includes(parsed.businessDate)) {
    return { filename, status: 'error', businessDate: parsed.businessDate,
      message: restrictTo.closingOut
        ? `This report is for ${niceDate(parsed.businessDate)}, but you're closing out ${niceDate(restrictTo.closingOut)}. Pick that day's report, or switch days above.`
        : `This report is for ${niceDate(parsed.businessDate)}, which can't be uploaded here. Ask an admin.` };
  }

  const { data: businesses } = await supabase.from('businesses').select('id, name, pos_match').eq('active', true);
  const store = (businesses ?? []).find((b) =>
    b.pos_match && parsed.storeName.toLowerCase().includes(String(b.pos_match).toLowerCase()));
  if (restrictTo && store?.id !== restrictTo.businessId) {
    return { filename, status: 'error', store: parsed.storeName,
      message: `This report is for "${parsed.storeName}", not ${restrictTo.storeName}.` };
  }
  if (!store) {
    const message = `No store matches "${parsed.storeName}". An admin needs to assign it.`;
    await supabase.from('pos_files').insert({ filename, sha256, source, status: 'unknown_store', business_date: parsed.businessDate, message });
    return { filename, status: 'unknown_store', store: parsed.storeName, businessDate: parsed.businessDate, message };
  }

  if (opts.noReplace) {
    const { data: have } = await supabase.from('pos_daily').select('business_date')
      .eq('business_id', store.id).eq('business_date', parsed.businessDate).maybeSingle();
    if (have) return { filename, status: 'duplicate', store: store.name, businessDate: parsed.businessDate,
      message: `${store.name} already has ${niceDate(parsed.businessDate)}. Only an admin can replace a day.` };
  }

  const failed = parsed.checks.filter((c) => !c.ok);
  if (failed.length) {
    const message = `Held: ${failed.map((c) => `${c.name} (${c.detail})`).join('; ')}`;
    await supabase.from('pos_files').insert({ filename, sha256, source, status: 'held', business_id: store.id, business_date: parsed.businessDate, message });
    return { filename, status: 'held', store: store.name, businessDate: parsed.businessDate, message };
  }

  const { data: file, error: fileErr } = await supabase.from('pos_files').insert({
    filename, sha256, source, status: 'processed', business_id: store.id, business_date: parsed.businessDate,
    message: 'All checks passed',
  }).select('id').single();
  if (fileErr) return { filename, status: 'error', message: 'Couldn’t save the file record.' };

  const t = parsed.departmentTotals;
  const { error: dayErr } = await supabase.from('pos_daily').upsert({
    business_id: store.id,
    business_date: parsed.businessDate,
    total_sales: parsed.netSales,
    cost: t.cost,
    profit: t.profit,
    profit_pct: t.profitPct,                // as the POS reports it
    card_sales: parsed.cardTotal,
    cash_sales: parsed.netCashFlow,         // Net Cash-Flow: what the drawer must match
    non_revenue: parsed.nonRevenue,
    transactions: parsed.transactions,
    file_id: file.id,
    updated_at: new Date().toISOString(),
  });
  if (dayErr) return { filename, status: 'error', message: 'Couldn’t save the daily totals.' };

  await supabase.from('pos_departments').delete().eq('business_id', store.id).eq('business_date', parsed.businessDate);
  const { error: deptErr } = await supabase.from('pos_departments').insert(parsed.departments.map((d) => ({
    business_id: store.id, business_date: parsed.businessDate, department: d.department,
    qty: d.qty, sales: d.sales, cost: d.cost, profit: d.profit, profit_pct: d.profitPct,
  })));
  if (deptErr) return { filename, status: 'error', message: 'Saved totals, but departments failed to save.' };

  return {
    filename, status: 'processed', store: store.name, businessDate: parsed.businessDate,
    message: `Sales $${parsed.netSales.toFixed(2)} · cash $${parsed.netCashFlow.toFixed(2)} · ${parsed.departments.length} departments`,
  };
}
