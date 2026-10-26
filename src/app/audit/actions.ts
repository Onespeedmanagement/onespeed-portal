'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { parseAmazon, parseBankRegister, parseChase, type Parsed } from '@/lib/audit/parse';
import { categorize, type Rule } from '@/lib/audit/categorize';

export type UploadState = { ok?: string; error?: string };
type Supa = Awaited<ReturnType<typeof supabaseServer>>;

async function context(supabase: Supa) {
  const [{ data: rules }, { data: stores }, { data: biz }] = await Promise.all([
    supabase.from('audit_rules').select('pattern, category').order('created_at'),
    supabase.from('stores').select('id, name, pos_match'),
    supabase.from('businesses').select('name'),
  ]);
  // our own stores / companies: money between them isn't spending
  const internal = [...(biz ?? []).map((b) => b.name), ...(stores ?? []).map((s) => s.pos_match ?? '')].filter((n) => n && n.length > 5);
  return { rules: (rules ?? []) as Rule[], internal };
}

export async function uploadAudit(_p: UploadState, form: FormData): Promise<UploadState> {
  await requireRole('admin');
  const source = String(form.get('source') ?? '') as 'amazon' | 'chase' | 'register';
  const businessId = String(form.get('business_id') ?? '') || null;
  const file = form.get('file');
  if (!['amazon', 'chase', 'register'].includes(source)) return { error: 'Pick what kind of file this is.' };
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose the file first.' };
  if (file.size > 15 * 1024 * 1024) return { error: 'That file is over 15 MB. Download a shorter date range.' };
  if (!businessId && source !== 'chase') return { error: 'Pick the store this file is for.' };
  if (!/\.(csv|xlsx?|txt)$/i.test(file.name)) return { error: 'Upload the CSV or Excel download.' };

  let parsed: Parsed;
  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    parsed = source === 'amazon' ? parseAmazon(bytes) : source === 'chase' ? parseChase(bytes, file.name) : parseBankRegister(bytes);
  } catch (e) { return { error: (e as Error).message }; }

  const supabase = await supabaseServer();
  if (businessId) {
    const { data: s } = await supabase.from('stores').select('id').eq('id', businessId).maybeSingle();
    if (!s) return { error: 'Pick a store.' };
  }
  const { rules, internal } = await context(supabase);

  // Skip rows already loaded from an earlier, overlapping download
  const existing = new Set<string>();
  for (let page = 0; ; page++) {
    let q = supabase.from('audit_txns').select('fingerprint').eq('source', source).range(page * 1000, page * 1000 + 999);
    q = businessId ? q.eq('business_id', businessId) : q.is('business_id', null);
    const { data } = await q;
    for (const r of data ?? []) existing.add(r.fingerprint);
    if (!data || data.length < 1000) break;
  }
  const fresh = parsed.txns.filter((t) => !existing.has(t.fingerprint));
  const dates = parsed.txns.map((t) => t.txn_date).sort();
  const label = String(form.get('label') ?? '').trim() || parsed.label;
  const { data: f, error } = await supabase.from('audit_files').insert({
    source, business_id: businessId, label, filename: file.name.slice(0, 200), rows: fresh.length, date_from: dates[0], date_to: dates[dates.length - 1],
  }).select('id').single();
  if (error || !f) return { error: 'Couldn’t save the file.' };
  for (let i = 0; i < fresh.length; i += 500) {
    const chunk = fresh.slice(i, i + 500).map((t) => ({ ...t, file_id: f.id, source, business_id: businessId, category: categorize(source, t.vendor, t.item, rules, internal) }));
    const { error: e2 } = await supabase.from('audit_txns').insert(chunk);
    if (e2) { await supabase.from('audit_files').delete().eq('id', f.id); return { error: `Couldn’t save the rows: ${e2.message}` }; }
  }
  revalidatePath('/audit');
  const skipped = parsed.txns.length - fresh.length;
  return { ok: `${parsed.note}. ${fresh.length} added${skipped ? `, ${skipped} already loaded from an earlier file` : ''} (${dates[0]} to ${dates[dates.length - 1]}).` };
}

export async function deleteAuditFile(form: FormData) {
  await requireRole('admin');
  const supabase = await supabaseServer();
  await supabase.from('audit_files').delete().eq('id', String(form.get('id')));
  revalidatePath('/audit');
}

// Re-sort everything after a rule changes
async function recategorize(supabase: Supa) {
  const { rules, internal } = await context(supabase);
  const changes = new Map<string, number[]>();
  for (let page = 0; ; page++) {
    const { data } = await supabase.from('audit_txns').select('id, source, vendor, item, category').order('id').range(page * 1000, page * 1000 + 999);
    for (const t of data ?? []) {
      const c = categorize(t.source, t.vendor, t.item, rules, internal);
      if (c !== t.category) changes.set(c, [...(changes.get(c) ?? []), t.id]);
    }
    if (!data || data.length < 1000) break;
  }
  for (const [category, ids] of changes) for (let i = 0; i < ids.length; i += 300) await supabase.from('audit_txns').update({ category }).in('id', ids.slice(i, i + 300));
  return [...changes.values()].reduce((a, b) => a + b.length, 0);
}

export async function addRule(_p: UploadState, form: FormData): Promise<UploadState> {
  await requireRole('admin');
  const pattern = String(form.get('pattern') ?? '').trim();
  const category = (String(form.get('category_new') ?? '').trim() || String(form.get('category') ?? '').trim()).slice(0, 60);
  if (pattern.length < 3) return { error: 'Type at least 3 letters of the vendor or item name.' };
  if (!category) return { error: 'Pick a category.' };
  const supabase = await supabaseServer();
  await supabase.from('audit_rules').insert({ pattern, category });
  const n = await recategorize(supabase);
  revalidatePath('/audit');
  return { ok: `Saved: “${pattern}” → ${category}. ${n} line${n === 1 ? '' : 's'} re-sorted.` };
}

export async function deleteRule(form: FormData) {
  await requireRole('admin');
  const supabase = await supabaseServer();
  await supabase.from('audit_rules').delete().eq('id', String(form.get('id')));
  await recategorize(supabase);
  revalidatePath('/audit');
}

export async function saveAltPrice(form: FormData) {
  await requireRole('admin');
  const item_key = String(form.get('item_key') ?? '');
  const supplier = String(form.get('supplier') ?? '').trim();
  const price = Number(String(form.get('unit_price') ?? '').replace(/[$,\s]/g, ''));
  const supabase = await supabaseServer();
  if (!supplier || !(price > 0)) await supabase.from('audit_alt_prices').delete().eq('item_key', item_key);
  else await supabase.from('audit_alt_prices').upsert({ item_key, supplier: supplier.slice(0, 80), unit_price: price, note: String(form.get('note') ?? '').slice(0, 200) || null, updated_at: new Date().toISOString() });
  revalidatePath('/audit');
}

export async function dismissFlag(form: FormData) {
  await requireRole('admin');
  const supabase = await supabaseServer();
  const key = String(form.get('key') ?? '');
  if (form.get('undo')) await supabase.from('audit_dismissed').delete().eq('key', key);
  else await supabase.from('audit_dismissed').upsert({ key, note: String(form.get('note') ?? '') || null });
  revalidatePath('/audit');
}
