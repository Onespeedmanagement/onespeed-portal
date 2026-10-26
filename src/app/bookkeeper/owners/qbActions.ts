'use server';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { addDays } from '@/lib/dates';
import { parseRegister, summarize, type OutItem, type RegisterSummary } from '@/lib/qb/parseRegister';
import { trackFrom } from '@/lib/qb/outstanding';
import { registerTxns } from '@/lib/audit/parse';

type Supa = Awaited<ReturnType<typeof supabaseServer>>;
type Row = { id: string; fingerprint: string; payee: string | null; txn_date: string; amount: number; cleared_on: string | null; last_seen: string };

export type QbPreview = {
  error?: string;
  storeName?: string; date?: string;
  summary?: RegisterSummary;
  added?: OutItem[]; cleared?: { payee: string | null; txn_date: string; amount: number }[]; kept?: number;
  storeCheck?: { ok: boolean | null; text: string };
  payload?: string;
};
export type QbSaved = { ok?: string; error?: string };

const MAX_BYTES = 5 * 1024 * 1024;

async function diff(supabase: Supa, businessId: string, items: OutItem[]) {
  const { data } = await supabase.from('qb_outstanding').select('id, fingerprint, payee, txn_date, amount, cleared_on, last_seen').eq('business_id', businessId);
  const rows = ((data ?? []) as Row[]).map((r) => ({ ...r, amount: Number(r.amount) }));
  const byFp = new Map(rows.map((r) => [r.fingerprint, r]));
  const inFile = new Set(items.map((i) => i.fingerprint));
  return {
    rows, byFp,
    added: items.filter((i) => !byFp.get(i.fingerprint) || byFp.get(i.fingerprint)!.cleared_on),
    kept: items.filter((i) => byFp.get(i.fingerprint) && !byFp.get(i.fingerprint)!.cleared_on),
    cleared: rows.filter((r) => !r.cleared_on && !inFile.has(r.fingerprint)),
    lastUpload: rows.reduce((m, r) => (r.last_seen > m ? r.last_seen : m), ''),
  };
}

// Step 1: read the file and show what would change. Nothing is saved.
export async function previewQb(_p: QbPreview | null, form: FormData): Promise<QbPreview> {
  await requireRole('bookkeeper');
  const file = form.get('file');
  const businessId = String(form.get('business_id') || '');
  const date = String(form.get('business_date') || '');
  if (!(file instanceof File) || file.size === 0) return { error: 'Choose the QuickBooks register file first.' };
  if (file.size > MAX_BYTES) return { error: 'That file is too big (over 5 MB).' };
  if (!/\.(xls|xlsx|csv)$/i.test(file.name)) return { error: 'Upload the register as it comes from QuickBooks (.xls, .xlsx or .csv).' };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return { error: 'Pick the report date first.' };

  const supabase = await supabaseServer();
  const { data: store } = await supabase.from('stores').select('id, name').eq('id', businessId).maybeSingle();
  if (!store) return { error: 'Pick a store first.' };

  let summary: RegisterSummary;
  let cardDeposits: { date: string; amount: number }[] = [];
  let audit: [string, string | null, string | null, string | null, number, string][] = [];
  try {
    const reg = parseRegister(new Uint8Array(await file.arrayBuffer()));
    // Every payment in the register also feeds the expense audit (admins only see that)
    audit = registerTxns(reg).txns.map((t) => [t.txn_date, t.ref, t.vendor, t.item, t.amount, t.fingerprint]);
    summary = summarize(reg, await trackFrom(supabase));
    cardDeposits = reg.rows.filter((r) => r.deposit > 0 && /credit card/i.test(r.account ?? '') && r.date <= date && r.date >= addDays(date, -6))
      .map((r) => ({ date: r.date, amount: r.deposit }));
  } catch (e) {
    return { error: `Couldn't read that file: ${(e as Error).message}` };
  }

  const d = await diff(supabase, store.id, summary.outstanding);
  if (d.lastUpload && date < d.lastUpload) {
    return { error: `A file for ${d.lastUpload} was already uploaded for ${store.name}. Upload files in date order, newest last.` };
  }

  // Wrong-store guard: the register's card deposits should match this store's POS card sales
  let storeCheck: QbPreview['storeCheck'] = { ok: null, text: 'No card deposits in the last week to check the store against.' };
  if (cardDeposits.length) {
    const { data: pos } = await supabase.from('pos_daily').select('business_date, card_sales').eq('business_id', store.id)
      .gte('business_date', addDays(date, -6)).lte('business_date', date);
    const matches = cardDeposits.filter((c) => (pos ?? []).some((p) => Math.abs(Number(p.card_sales) - c.amount) < 0.01));
    storeCheck = !pos?.length ? { ok: null, text: `No POS reports for ${store.name} that week to check against.` }
      : matches.length ? { ok: true, text: `Card deposits match ${store.name}'s POS card sales (${matches.length} of ${cardDeposits.length} days).` }
      : { ok: false, text: `None of this file's card deposits match ${store.name}'s POS card sales. Is this the right store's register?` };
  }

  return {
    storeName: store.name, date, summary, storeCheck,
    added: d.added, kept: d.kept.length,
    cleared: d.cleared.map((r) => ({ payee: r.payee, txn_date: r.txn_date, amount: r.amount })),
    payload: JSON.stringify({ businessId: store.id, date, summary, audit }),
  };
}

// Step 2: save what the preview showed.
export async function saveQb(_p: QbSaved, form: FormData): Promise<QbSaved> {
  const me = await requireRole('bookkeeper');
  let p: { businessId: string; date: string; summary: RegisterSummary; audit?: unknown[] };
  try { p = JSON.parse(String(form.get('payload') || '')); } catch { return { error: 'Preview again, then save.' }; }
  const items = Array.isArray(p?.summary?.outstanding) ? p.summary.outstanding : null;
  if (!p?.businessId || !/^\d{4}-\d{2}-\d{2}$/.test(p.date ?? '') || !items
      || !items.every((i) => typeof i.fingerprint === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(i.txn_date) && Number.isFinite(i.amount))) {
    return { error: 'Preview again, then save.' };
  }
  const supabase = await supabaseServer();
  const d = await diff(supabase, p.businessId, items);
  if (d.lastUpload && p.date < d.lastUpload) return { error: `A file for ${d.lastUpload} was already uploaded. Upload files in date order.` };

  const fresh = items.filter((i) => !d.byFp.has(i.fingerprint));
  if (fresh.length) {
    const { error } = await supabase.from('qb_outstanding').insert(fresh.map((i) => ({
      business_id: p.businessId, fingerprint: i.fingerprint, txn_date: i.txn_date, ref_no: i.ref_no, payee: i.payee, memo: i.memo,
      txn_type: i.txn_type, account: i.account, amount: i.amount, first_seen: p.date, last_seen: p.date, updated_by: me.email,
    })));
    if (error) return { error: 'Couldn’t save the new checks. Nothing else was changed.' };
  }
  for (const i of items.filter((x) => d.byFp.has(x.fingerprint))) {
    await supabase.from('qb_outstanding').update({ last_seen: p.date, amount: i.amount, cleared_on: null, updated_by: me.email })
      .eq('id', d.byFp.get(i.fingerprint)!.id);
  }
  if (d.cleared.length) {
    await supabase.from('qb_outstanding').update({ cleared_on: p.date, updated_by: me.email }).in('id', d.cleared.map((r) => r.id));
  }
  const s = p.summary;
  if (s.balance == null || !Number.isFinite(s.balance)) return { error: 'Checks saved, but the file had no Ending Balance. Enter the balance by hand below.' };
  const { error: repErr } = await supabase.from('owners_report').upsert({
    business_id: p.businessId, business_date: p.date,
    qb_balance: s.balance, bank_balance: s.bankBalance, outstanding_total: s.total,
    deposits_in_transit: s.depositsInTransit?.total ?? null, source: 'QuickBooks register',
    entered_by: me.email, entered_at: new Date().toISOString(),
  });
  // Feed the expense audit (best effort: never blocks the balance)
  if (Array.isArray(p.audit) && p.audit.length) {
    try { await supabase.rpc('audit_ingest_register', { b: p.businessId, rows: p.audit.slice(0, 20000) }); } catch { /* audit is optional */ }
  }
  revalidatePath('/bookkeeper/owners');
  revalidatePath('/owners');
  revalidatePath('/audit');
  if (repErr) return { error: 'Checks saved, but the balance didn’t save. Enter it by hand below.' };
  return { ok: `Saved: ${d.added.length} added, ${d.cleared.length} cleared, QuickBooks balance $${s.balance.toFixed(2)}.` };
}
