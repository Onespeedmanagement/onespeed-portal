// Reads a QuickBooks Online bank register export (Banking → Register → Export, .xls/.xlsx/.csv):
// a title row ("WSFS CHECKING … Bank Balance: … Ending Balance: …"), then
// Date | Ref No. | Payee | Memo | Payment | Deposit | Reconciliation Status | Balance | Type | Account …
// Note: the file comes from the bookkeeper (signed in), and is size-limited before it gets here.
import * as XLSX from 'xlsx';

export type RegisterRow = {
  date: string;              // YYYY-MM-DD
  ref: string | null; payee: string | null; memo: string | null;
  payment: number; deposit: number;
  status: string | null;     // blank = not cleared yet; "Cleared" / "Reconciled"
  balance: number | null;    // register balance after this line
  type: string | null; account: string | null;
};
export type Register = { accountName: string | null; bankBalance: number | null; endingBalance: number | null; rows: RegisterRow[] };

export type OutItem = {
  fingerprint: string; txn_date: string; ref_no: string | null; payee: string | null; memo: string | null;
  txn_type: string | null; account: string | null; amount: number;
};
export type RegisterSummary = {
  balance: number | null;          // QuickBooks "Ending Balance" at the top of the file
  bankBalance: number | null;      // "Bank Balance" at the top of the file
  outstanding: OutItem[];          // payments not cleared by the bank, dated on/after trackFrom (future-dated included)
  total: number;
  depositsInTransit: { count: number; total: number };
  olderCount: number;              // uncleared payments dated before trackFrom (not tracked)
  latestDate: string;
};

const money = (v: unknown): number => {
  if (v == null || v === '') return 0;
  if (typeof v === 'number') return v;
  const n = Number(String(v).replace(/[$,\s]/g, '').replace(/^\((.*)\)$/, '-$1'));
  return Number.isFinite(n) ? n : 0;
};
const text = (v: unknown) => (v == null || String(v).trim() === '' ? null : String(v).trim());
const isoDate = (v: unknown): string | null => {
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null; }
  const m = String(v ?? '').trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`; }
  const iso = String(v ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return iso ? `${iso[1]}-${iso[2]}-${iso[3]}` : null;
};
const cents = (n: number) => Math.round(n * 100) / 100;

export function parseRegister(bytes: Uint8Array): Register {
  const wb = XLSX.read(bytes, { type: 'array' });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const grid = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }) as unknown[][];

  const h = grid.findIndex((r) => r.some((c) => /^date$/i.test(String(c ?? '').trim())) && r.some((c) => /^payment$/i.test(String(c ?? '').trim())));
  if (h < 0) throw new Error('This doesn\u2019t look like a QuickBooks bank register (no Date / Payment columns).');
  const head = grid[h].map((c) => String(c ?? '').trim().toLowerCase());
  const col = (re: RegExp) => head.findIndex((c) => re.test(c));
  const ix = {
    date: col(/^date$/), ref: col(/^ref/), payee: col(/^payee/), memo: col(/^memo/), payment: col(/^payment/), deposit: col(/^deposit/),
    status: col(/reconcil|cleared/), balance: col(/^balance/), type: col(/^type$/), account: col(/^account$/),
  };
  if (ix.status < 0) throw new Error('The file has no Reconciliation Status column, so cleared checks can\u2019t be told apart.');

  const title = grid.slice(0, h).flat().map((c) => String(c ?? '')).join(' ');
  const bank = title.match(/Bank Balance:\s*\$?\s*(-?[\d,]+\.?\d*)/i);
  const ending = title.match(/Ending Balance:\s*\$?\s*(-?[\d,]+\.?\d*)/i);
  const accountName = text(title.split(/\t|Bank Balance/i)[0]);

  const get = (r: unknown[], i: number) => (i >= 0 ? r[i] : null);
  const rows: RegisterRow[] = [];
  for (const r of grid.slice(h + 1)) {
    const date = isoDate(get(r, ix.date));
    if (!date) continue;
    rows.push({
      date, ref: text(get(r, ix.ref)), payee: text(get(r, ix.payee)), memo: text(get(r, ix.memo)),
      payment: cents(money(get(r, ix.payment))), deposit: cents(money(get(r, ix.deposit))),
      status: text(get(r, ix.status)), balance: ix.balance >= 0 && get(r, ix.balance) != null ? cents(money(get(r, ix.balance))) : null,
      type: text(get(r, ix.type)), account: text(get(r, ix.account)),
    });
  }
  if (!rows.length) throw new Error('No transactions found in the file.');
  return { accountName, bankBalance: bank ? money(bank[1]) : null, endingBalance: ending ? money(ending[1]) : null, rows };
}

// Payroll direct deposits are grouped into one "Payroll" line per pay date.
export function summarize(reg: Register, trackFrom: string): RegisterSummary {
  const open = (r: RegisterRow) => !r.status || /^(uncleared|not cleared|-)$/i.test(r.status);
  const pending = reg.rows.filter((r) => open(r) && r.payment > 0);
  const tracked = pending.filter((r) => r.date >= trackFrom).sort((a, b) => a.date.localeCompare(b.date));

  const outstanding: OutItem[] = [];
  const payroll = new Map<string, OutItem>();
  const seen = new Map<string, number>();
  for (const r of tracked) {
    if (/paycheck/i.test(r.type ?? '')) {
      const p = payroll.get(r.date) ?? { fingerprint: `payroll|${r.date}`, txn_date: r.date, ref_no: 'DD', payee: 'Payroll', memo: r.memo, txn_type: 'Payroll', account: r.account, amount: 0 };
      p.amount = cents(p.amount + r.payment);
      if (!payroll.has(r.date)) { payroll.set(r.date, p); outstanding.push(p); }
      continue;
    }
    const base = [r.date, r.ref ?? '', r.payee ?? '', r.payment.toFixed(2), r.memo ?? ''].join('|').toLowerCase();
    const n = (seen.get(base) ?? 0) + 1; seen.set(base, n);
    outstanding.push({ fingerprint: `${base}#${n}`, txn_date: r.date, ref_no: r.ref, payee: r.payee, memo: r.memo, txn_type: r.type, account: r.account, amount: r.payment });
  }
  const dit = reg.rows.filter((r) => open(r) && r.deposit > 0 && r.date >= trackFrom);
  const newestFirst = reg.rows[0].date >= reg.rows[reg.rows.length - 1].date;
  return {
    balance: reg.endingBalance ?? (newestFirst ? reg.rows[0].balance : reg.rows[reg.rows.length - 1].balance),
    bankBalance: reg.bankBalance,
    outstanding, total: cents(outstanding.reduce((a, o) => a + o.amount, 0)),
    depositsInTransit: { count: dit.length, total: cents(dit.reduce((a, r) => a + r.deposit, 0)) },
    olderCount: pending.length - tracked.length,
    latestDate: reg.rows.reduce((m, r) => (r.date > m ? r.date : m), reg.rows[0].date),
  };
}
