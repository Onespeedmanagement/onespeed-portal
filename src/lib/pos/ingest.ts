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
export async function ingestPosPdf(
  supabase: SupabaseClient, bytes: Uint8Array, filename: string, source: 'email' | 'upload',
): Promise<IngestResult> {
  const sha256 = createHash('sha256').update(bytes).digest('hex');

  const { data: existing } = await supabase.from('pos_files').select('id').eq('sha256', sha256).maybeSingle();
  if (existing) return { filename, status: 'duplicate', message: 'Already received. Ignored.' };

  let parsed;
  try {
    parsed = await parseCashSalesSummary(bytes);
  } catch (e) {
    const message = `Couldn't read this file: ${(e as Error).message}`;
    await supabase.from('pos_files').insert({ filename, sha256, source, status: 'error', message });
    return { filename, status: 'error', message };
  }

  const { data: businesses } = await supabase.from('businesses').select('id, name, pos_match').eq('active', true);
  const store = (businesses ?? []).find((b) =>
    b.pos_match && parsed.storeName.toLowerCase().includes(String(b.pos_match).toLowerCase()));
  if (!store) {
    const message = `No store matches "${parsed.storeName}". An admin needs to assign it.`;
    await supabase.from('pos_files').insert({ filename, sha256, source, status: 'unknown_store', business_date: parsed.businessDate, message });
    return { filename, status: 'unknown_store', store: parsed.storeName, businessDate: parsed.businessDate, message };
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
