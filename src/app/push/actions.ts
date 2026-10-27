'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { parseUnsold } from '@/lib/push/parseUnsold';

export type PushState = { ok?: string; error?: string };

// Same store? Compare the distinctive words of the names ("Christiana Wine & Spirits (Newark)" ↔ "Christiana Wine & Spirits")
const words = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length > 3 && !['wine', 'wines', 'spirits', 'liquor', 'liquors', 'store'].includes(w));

export async function uploadUnsold(_p: PushState, form: FormData): Promise<PushState> {
  await requireRole('admin', 'manager');
  const businessId = String(form.get('business_id') ?? '');
  const file = form.get('file');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose the report first.' };
  if (file.size > 10 * 1024 * 1024) return { error: 'That file is over 10 MB.' };
  if (!/\.(xls|xlsx|csv)$/i.test(file.name)) return { error: 'Upload the Unsold Item List Report as Excel (.xls).' };
  let list;
  try { list = parseUnsold(new Uint8Array(await file.arrayBuffer())); } catch (e) { return { error: (e as Error).message }; }

  const supabase = await supabaseServer();
  const { data: store } = await supabase.from('stores').select('id, name, pos_match').eq('id', businessId).maybeSingle();
  if (!store) return { error: 'Pick your store.' };
  const mine = new Set([...words(store.name), ...words(store.pos_match ?? '')]);
  if (words(list.storeName).length && !words(list.storeName).some((w) => mine.has(w)))
    return { error: `This report is for “${list.storeName}”, not ${store.name}.` };

  // Keep the manager's focus picks across a new upload; picks missing from the new list have sold
  const { data: prev } = await supabase.from('unsold_items').select('sku, description').eq('business_id', store.id).eq('focus', true);
  const focusSkus = new Set((prev ?? []).map((p) => p.sku));
  await supabase.from('unsold_items').delete().eq('business_id', store.id);
  for (let i = 0; i < list.items.length; i += 500) {
    const { error } = await supabase.from('unsold_items').upsert(list.items.slice(i, i + 500).map((it) => ({ business_id: store.id, ...it, focus: focusSkus.has(it.sku) })), { onConflict: 'business_id,sku' });
    if (error) return { error: `Couldn’t save the list: ${error.message}` };
  }
  await supabase.from('unsold_lists').upsert({ business_id: store.id, period_from: list.from, period_to: list.to, filename: file.name.slice(0, 200), uploaded_at: new Date().toISOString() });
  revalidatePath('/push');
  const sold = (prev ?? []).filter((p) => !list.items.some((it) => it.sku === p.sku));
  return { ok: `Saved ${list.items.length} items for ${store.name}.${sold.length ? ` 🎉 ${sold.length} focus item${sold.length === 1 ? '' : 's'} sold since the last list: ${sold.slice(0, 5).map((s) => s.description).join(', ')}${sold.length > 5 ? '…' : ''}` : ''}` };
}

// Add or remove an item from the focus list
export async function toggleFocus(form: FormData) {
  await requireRole('admin', 'manager');
  const supabase = await supabaseServer();
  await supabase.from('unsold_items').update({ focus: form.get('on') === '1' })
    .eq('business_id', String(form.get('business_id') ?? '')).eq('sku', String(form.get('sku') ?? ''));
  revalidatePath('/push');
}

export async function clearFocus(form: FormData) {
  await requireRole('admin', 'manager');
  const supabase = await supabaseServer();
  await supabase.from('unsold_items').update({ focus: false }).eq('business_id', String(form.get('business_id') ?? '')).eq('focus', true);
  revalidatePath('/push');
}
