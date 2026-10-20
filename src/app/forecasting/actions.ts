'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { parseInventory } from '@/lib/inventory/parseInventory';
import { parseInventoryPdf } from '@/lib/inventory/parseInventoryPdf';
import { normDept } from '@/lib/forecast';
import { toCents } from '@/lib/format';

export type InvState = { ok?: string; error?: string; unmatched?: string[] };
type Line = { department: string; qty: number | null; cost_value: number; retail_value: number | null; categories?: { category: string; value: number }[] };

async function save(businessId: string, asOf: string, source: string, lines: Line[], reportStore?: string): Promise<InvState> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf)) return { error: 'Pick the date the inventory was counted.' };
  if (!lines.length) return { error: 'No departments with an inventory value.' };
  const supabase = await supabaseServer();
  const { data: store } = await supabase.from('stores').select('id, name, pos_match').eq('id', businessId).maybeSingle();
  if (!store) return { error: 'Pick a store.' };
  if (reportStore) {
    const words = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !['wine', 'wines', 'spirits', 'liquor', 'liquors'].includes(w));
    const mine = new Set([...words(store.name), ...words(store.pos_match ?? '')]);
    if (words(reportStore).length && !words(reportStore).some((w) => mine.has(w)))
      return { error: `This report is for “${reportStore}”, not ${store.name}. Pick the right store and upload again.` };
  }
  await supabase.from('inventory_snapshots').delete().eq('business_id', businessId).eq('as_of', asOf);
  const { data: snap, error } = await supabase.from('inventory_snapshots').insert({ business_id: businessId, as_of: asOf, source }).select('id').single();
  if (error || !snap) return { error: 'Couldn’t save the inventory.' };
  const { error: e2 } = await supabase.from('inventory_lines').insert(lines.map((l) => ({ snapshot_id: snap.id, ...l })));
  if (e2) return { error: `Couldn’t save the departments: ${e2.message}` };

  // Which inventory departments don't match a department name on the POS sales report
  const { data: seen } = await supabase.from('pos_departments').select('department').eq('business_id', businessId).gte('business_date', new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10)).limit(3000);
  const known = new Set((seen ?? []).map((s) => normDept(s.department)));
  const unmatched = known.size ? lines.map((l) => l.department).filter((d) => !known.has(normDept(d))) : [];
  revalidatePath('/forecasting');
  const total = lines.reduce((a, l) => a + l.cost_value, 0);
  return { ok: `Saved ${lines.length} departments for ${store.name} as of ${asOf}: ${total.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 })} at cost.`, unmatched };
}

export async function uploadInventory(_p: InvState, form: FormData): Promise<InvState> {
  await requireRole('admin');
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose the file first.' };
  if (!/\.(xlsx?|csv|pdf)$/i.test(file.name)) return { error: 'Upload the Inventory Value Analysis Report (PDF), or an Excel / CSV export.' };
  if (file.size > 5 * 1024 * 1024) return { error: 'That file is over 5 MB.' };
  if (/\.pdf$/i.test(file.name)) {
    let r;
    try { r = await parseInventoryPdf(new Uint8Array(await file.arrayBuffer())); } catch (e) { return { error: (e as Error).message }; }
    const sum = r.lines.reduce((a, l) => a + l.cost_value, 0);
    if (r.grandTotal != null && Math.abs(sum - r.grandTotal) > 1) return { error: `The departments add up to ${sum.toFixed(2)} but the report’s grand total is ${r.grandTotal.toFixed(2)}. Nothing saved.` };
    return save(String(form.get('business_id') ?? ''), r.asOf ?? String(form.get('as_of') ?? ''), file.name, r.lines.filter((l) => l.cost_value !== 0), r.storeName);
  }
  let parsed;
  try { parsed = parseInventory(new Uint8Array(await file.arrayBuffer())); } catch (e) { return { error: (e as Error).message }; }
  const r = await save(String(form.get('business_id') ?? ''), String(form.get('as_of') ?? ''), file.name, parsed.lines.filter((l) => l.cost_value !== 0));
  return r.ok ? { ...r, ok: `${r.ok} (read columns: ${parsed.columns})` } : r;
}

export async function saveInventoryManual(_p: InvState, form: FormData): Promise<InvState> {
  await requireRole('admin');
  const lines: Line[] = [];
  for (const [k, v] of form.entries()) {
    const m = k.match(/^cost_(\d+)$/);
    if (!m || String(v).trim() === '') continue;
    const cost = toCents(String(v));
    const department = String(form.get(`dept_${m[1]}`) ?? '').trim();
    if (!department || cost == null || Number.isNaN(cost)) continue;
    const q = String(form.get(`qty_${m[1]}`) ?? '').replace(/[,\s]/g, '');
    lines.push({ department, qty: q === '' ? null : Number(q), cost_value: cost, retail_value: null });
  }
  return save(String(form.get('business_id') ?? ''), String(form.get('as_of') ?? ''), 'typed in', lines);
}

export async function saveTargets(form: FormData) {
  await requireRole('admin');
  const supabase = await supabaseServer();
  const { data } = await supabase.from('settings').select('value').eq('key', 'inventory_target_days').maybeSingle();
  const cur = (data?.value ?? {}) as Record<string, number>;
  for (const [k, v] of form.entries()) {
    const m = k.match(/^t_(.+)$/);
    if (!m) continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 1 && n <= 365) cur[normDept(m[1])] = Math.round(n);
  }
  await supabase.from('settings').upsert({ key: 'inventory_target_days', value: cur });
  revalidatePath('/forecasting');
}

export async function deleteSnapshot(form: FormData) {
  await requireRole('admin');
  const supabase = await supabaseServer();
  await supabase.from('inventory_snapshots').delete().eq('id', String(form.get('id')));
  revalidatePath('/forecasting');
}
