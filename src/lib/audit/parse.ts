import * as XLSX from 'xlsx';
import { parseRegister, type Register } from '@/lib/qb/parseRegister';

// Turns an Amazon orders report, a Chase activity download or a QuickBooks register
// into one shape: date, vendor, item, amount (money out positive).
export type Txn = {
  txn_date: string; vendor: string | null; item: string | null; item_key: string | null;
  qty: number | null; unit_price: number | null; amount: number; ref: string | null; fingerprint: string;
};
export type Parsed = { txns: Txn[]; label: string | null; skipped: number; note: string };

const money = (v: unknown): number | null => {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v).trim();
  if (!/\d/.test(s)) return null;
  const neg = /^\(.*\)$/.test(s) || /^-/.test(s.replace(/^\$/, '')) || /^\$-/.test(s);
  const n = Number(s.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? (neg ? -n : n) : null;
};
const text = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v).trim());
const isoDate = (v: unknown): string | null => {
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null; }
  const s = String(v ?? '').trim();
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/);
  if (us) return `${us[3].length === 2 ? `20${us[3]}` : us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
};
const cents = (n: number) => Math.round(n * 100) / 100;
export const normTitle = (s: string) => s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').slice(0, 8).join(' ');

function grid(bytes: Uint8Array): unknown[][] {
  const wb = XLSX.read(bytes, { type: 'array', raw: false, cellDates: false });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: null }) as unknown[][];
}
function header(g: unknown[][], must: RegExp[]): { h: number; col: (re: RegExp) => number } | null {
  for (let h = 0; h < Math.min(g.length, 30); h++) {
    const head = (g[h] ?? []).map((c) => String(c ?? '').trim().toLowerCase());
    if (must.every((re) => head.some((c) => re.test(c)))) return { h, col: (re: RegExp) => head.findIndex((c) => re.test(c)) };
  }
  return null;
}
// Same charge twice in one file is real (two identical purchases): number repeats so both are kept
function fingerprints<T extends { key: string }>(rows: T[]): (Omit<T, 'key'> & { fingerprint: string })[] {
  const seen = new Map<string, number>();
  return rows.map(({ key, ...rest }) => { const n = (seen.get(key) ?? 0) + 1; seen.set(key, n); return { ...rest, fingerprint: `${key}|${n}` }; });
}

export function parseAmazon(bytes: Uint8Array): Parsed {
  const g = grid(bytes);
  const hd = header(g, [/order date/, /(title|product name|item description)/]);
  if (!hd) throw new Error('This doesn’t look like an Amazon orders report (no Order Date and Title columns). In Amazon Business: Reports → Orders report → download as CSV.');
  const { h, col } = hd;
  const ix = {
    date: col(/^order date/), id: col(/^order id/), title: col(/^(title|product name|item description)/), asin: col(/^asin$/),
    qty: col(/^(item quantity|quantity|qty)$/), ppu: col(/^(purchase ppu|unit price|item price|price per unit)$/),
    net: col(/^item net total$/), sub: col(/^(item subtotal|subtotal)$/), tax: col(/^item tax$/), owed: col(/^total owed$/),
    seller: col(/^seller name$/), status: col(/^(order status|item status)$/), cat: col(/^(amazon-internal product category|category|segment)$/),
  };
  let skipped = 0;
  const raw: (Omit<Txn, 'fingerprint'> & { key: string })[] = [];
  for (const r of g.slice(h + 1)) {
    const date = isoDate(r[ix.date]);
    const title = ix.title >= 0 ? text(r[ix.title]) : null;
    if (!date || !title) continue;
    if (ix.status >= 0 && /cancel/i.test(String(r[ix.status] ?? ''))) { skipped++; continue; }
    const qty = ix.qty >= 0 ? money(r[ix.qty]) : null;
    let amount = ix.net >= 0 ? money(r[ix.net]) : null;
    if (amount == null && ix.sub >= 0) amount = (money(r[ix.sub]) ?? 0) + (ix.tax >= 0 ? money(r[ix.tax]) ?? 0 : 0);
    if (amount == null && ix.owed >= 0) amount = money(r[ix.owed]);
    const ppu = ix.ppu >= 0 ? money(r[ix.ppu]) : null;
    if (amount == null && ppu != null) amount = ppu * (qty ?? 1);
    if (amount == null || amount === 0) { skipped++; continue; }
    const asin = ix.asin >= 0 ? text(r[ix.asin]) : null;
    const ref = ix.id >= 0 ? text(r[ix.id]) : null;
    raw.push({
      txn_date: date, vendor: ix.seller >= 0 ? text(r[ix.seller]) ?? 'Amazon' : 'Amazon', item: title.slice(0, 300),
      item_key: asin ?? normTitle(title), qty, unit_price: ppu ?? (qty ? cents(amount / qty) : null), amount: cents(amount), ref,
      key: `${ref ?? date}|${asin ?? normTitle(title)}|${qty ?? ''}|${cents(amount)}`,
    });
  }
  if (!raw.length) throw new Error('No order lines found in the file.');
  return { txns: fingerprints(raw), label: null, skipped, note: `${raw.length} item lines${skipped ? `, ${skipped} cancelled/empty skipped` : ''}` };
}

export function parseChase(bytes: Uint8Array, filename: string): Parsed {
  const g = grid(bytes);
  const hd = header(g, [/date/, /description/, /amount/]);
  if (!hd) throw new Error('This doesn’t look like a Chase download (no Date, Description and Amount columns). On chase.com: the card → Download account activity → CSV.');
  const { h, col } = hd;
  const ix = { date: col(/^(transaction date|posting date|date)$/), desc: col(/^description$/), amt: col(/^amount$/), type: col(/^type$/), cat: col(/^category$/), memo: col(/^memo$/), check: col(/check/), details: col(/^details$/), card: col(/^card$/) };
  const last4 = filename.match(/chase\D?(\d{4})/i)?.[1] ?? [...filename.matchAll(/(?<!\d)(\d{4})(?!\d)/g)].map((m) => m[1]).find((d) => !/^(19|20)\d\d$/.test(d)) ?? null;
  let skipped = 0;
  const raw: (Omit<Txn, 'fingerprint'> & { key: string })[] = [];
  for (const r of g.slice(h + 1)) {
    const date = isoDate(r[ix.date]);
    const desc = text(r[ix.desc]);
    const amt = money(r[ix.amt]);
    if (!date || !desc || amt == null) continue;
    const type = ix.type >= 0 ? String(r[ix.type] ?? '') : '';
    // Card: purchases are negative, payments to the card positive. Skip card payments.
    if (/payment/i.test(type) || /^(payment thank you|automatic payment|online payment)/i.test(desc)) { skipped++; continue; }
    // Chase checking download: deposits (CREDIT) aren't spending
    if (ix.details >= 0 && /credit/i.test(String(r[ix.details] ?? '')) && amt > 0) { skipped++; continue; }
    const out = -amt;   // money out positive; refunds/returns come in negative
    const hint = ix.cat >= 0 ? text(r[ix.cat]) : null;   // Chase's own category ("Food & Drink"), used when the merchant name doesn't say
    raw.push({ txn_date: date, vendor: desc.slice(0, 200), item: (ix.memo >= 0 ? text(r[ix.memo]) : null) ?? (hint ? `[${hint}]` : null), item_key: null, qty: null, unit_price: null,
      amount: cents(out), ref: ix.card >= 0 ? `card ${text(r[ix.card]) ?? ''}`.trim() : ix.check >= 0 ? text(r[ix.check]) : null, key: `${ix.card >= 0 ? r[ix.card] : ''}|${date}|${desc}|${cents(out)}` });
  }
  if (!raw.length) throw new Error('No transactions found in the file.');
  const cards = ix.card >= 0 ? [...new Set(g.slice(h + 1).map((r) => text(r[ix.card])).filter(Boolean))] : [];
  return { txns: fingerprints(raw), label: cards.length ? cards.map((c) => `…${c}`).join(', ') : last4 ? `…${last4}` : null, skipped, note: `${raw.length} transactions${skipped ? `, ${skipped} card payments skipped` : ''}` };
}

export function parseBankRegister(bytes: Uint8Array): Parsed {
  return registerTxns(parseRegister(bytes));
}

// Payments out of a parsed register (also used by the bookkeeper's daily QuickBooks upload)
export function registerTxns(reg: Register): Parsed {
  const raw = reg.rows.filter((r) => r.payment > 0).map((r) => ({
    txn_date: r.date, vendor: r.payee ?? (r.memo ? r.memo.replace(/^PREAUTHORIZED ACH DEBIT\s+/i, '').split(/\s{2,}| #|\d{6,}/)[0].slice(0, 60) : null),
    item: [r.memo, r.account ? `[${r.account}]` : null].filter(Boolean).join(' ') || null, item_key: null, qty: null, unit_price: null, amount: r.payment, ref: r.ref,
    key: `${r.date}|${r.ref ?? ''}|${r.payee ?? ''}|${r.payment}`,
  }));
  return { txns: fingerprints(raw), label: reg.accountName, skipped: reg.rows.length - raw.length, note: `${raw.length} payments (deposits left out)` };
}
