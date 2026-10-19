import { readRows, type Row } from '@/lib/pos/parseCashSalesSummary';

// Reads the Goddard FMS "Monthly Financial Report" PDF (2 pages):
// page 1 tuition by class, other fees, revenue vs cash receipts, royalties & marketing;
// page 2 operating expenses, operating income, capital expenditures, debt service.

export type Line = { label: string; amount: number };
export type FmsReport = {
  schoolName: string; schoolNumber: string | null; month: string; reportDate: string | null;
  tuition: Line[]; otherFees: Line[]; tuitionTotal: number | null; otherTotal: number | null; revenue: number | null;
  cashReceipts: number | null; preschoolRate: number | null; notSubject: number | null; royaltiesDue: number | null; marketingDue: number | null;
  expenses: Line[]; totalOpex: number | null; operatingIncome: number | null; capex: number | null; debtService: number | null;
  explanations: string | null;
  checks: { name: string; ok: boolean; detail: string }[];
};

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const NUM = /^\(?-?\$?[\d,]+(\.\d+)?\)?$/;
const num = (s: string) => { const neg = /^\(.*\)$/.test(s) || s.includes('-'); const v = Number(s.replace(/[^\d.]/g, '')); return neg ? -v : v; };
const clean = (s: string) => s.replace(/\s*\((?:[A-I]|\d+%)\)\s*:?$/, '').replace(/:$/, '').trim();

// "Label words 1,234" pairs in a row, each with the x where its label starts
function pairs(r: Row): { label: string; amount: number; x: number }[] {
  const out: { label: string; amount: number; x: number }[] = [];
  let words: string[] = []; let x0 = 0;
  for (const c of r.cells) {
    if (NUM.test(c.text) && words.length) {
      out.push({ label: clean(words.join(' ')), amount: num(c.text), x: x0 });
      words = [];
    } else if (!NUM.test(c.text)) {
      if (!words.length) x0 = c.x;
      words.push(c.text);
    }
  }
  return out;
}

const near = (a: number | null, b: number | null, tol = 2) => a != null && b != null && Math.abs(a - b) <= tol;
const sum = (ls: Line[]) => ls.reduce((t, l) => t + l.amount, 0);

export async function parseFms(pdfBytes: Uint8Array): Promise<FmsReport> {
  const rows = await readRows(pdfBytes);
  const text = (r: Row) => r.cells.map((c) => c.text).join(' ');
  if (!rows.some((r) => /MONTHLY FINANCIAL REPORT/i.test(text(r)))) throw new Error('This isn’t an FMS Monthly Financial Report.');

  // Header
  let schoolName = '', schoolNumber: string | null = null, month = '';
  for (const r of rows.filter((r) => r.page === 1).slice(0, 6)) {
    const t = text(r);
    const s = t.match(/^(.+?)\s*\(#\s*(\d+)\)\s*$/);
    if (s) { schoolName = s[1].trim(); schoolNumber = s[2]; }
    const m = t.match(/Reporting Month:\s*([A-Za-z]+)\s+(\d{4})/i);
    if (m) {
      const i = MONTHS.indexOf(m[1].toLowerCase());
      if (i >= 0) month = `${m[2]}-${String(i + 1).padStart(2, '0')}-01`;
    }
  }
  if (!month) throw new Error('Couldn’t find the “Reporting Month” on the report.');
  const reportDate = rows.map(text).map((t) => t.match(/Page\s+\d+\s+(\d{1,2}\/\d{1,2}\/\d{4})/)?.[1]).find(Boolean) ?? null;

  // Explanations: free text between "Explanations:" and the page footer
  const notes: string[] = [];
  let inNotes = false;
  for (const r of rows) {
    const t = text(r);
    if (/^Explanations:/i.test(t)) { inNotes = true; const rest = t.replace(/^Explanations:\s*/i, ''); if (rest) notes.push(rest); continue; }
    if (/^Page\s+\d+/i.test(t)) { inNotes = false; continue; }
    if (inNotes) notes.push(t);
  }

  const tuition: Line[] = [], otherFees: Line[] = [], expenses: Line[] = [];
  const named = new Map<string, number>();
  let section: 'tuition' | 'none' | 'expenses' | 'after' = 'none';
  for (const r of rows) {
    const t = text(r);
    if (/^Tuition Billed/i.test(t)) { section = 'tuition'; continue; }
    if (r.page >= 2 && section !== 'expenses' && section !== 'after' && !/^Page/i.test(t)) section = 'expenses';
    for (const p of pairs(r)) {
      if (/^Total (Tuition|Other) Billed|^Total Revenue|^Total Cash|^Total Operating|^Operating Income|^Revenue$|Royalties Due|Marketing Fee|Amounts Not Subject|^Cash Receipts|^Preschool Rate|^Diff\.|^Captial|^Capital|^Debt Service/i.test(p.label)) {
        named.set(p.label.toLowerCase(), p.amount);
        if (/^Total Tuition Billed/i.test(p.label)) section = section === 'tuition' ? 'tuition' : section;
        if (/^Total Operating/i.test(p.label)) section = 'after';
        continue;
      }
      if (section === 'tuition') (p.x < 320 ? tuition : otherFees).push({ label: p.label, amount: p.amount });
      else if (section === 'expenses') expenses.push({ label: p.label, amount: p.amount });
    }
    if (/^Total Tuition Billed/i.test(t)) section = 'none';
  }
  const get = (re: RegExp) => { for (const [k, v] of named) if (re.test(k)) return v; return null; };

  const r: FmsReport = {
    schoolName, schoolNumber, month, reportDate, tuition, otherFees,
    tuitionTotal: get(/^total tuition billed/), otherTotal: get(/^total other billed/), revenue: get(/^total revenue:?$/) ?? get(/^total revenue/),
    cashReceipts: get(/^total cash receipts/), preschoolRate: get(/^preschool rate/), notSubject: get(/^amounts not subject/),
    royaltiesDue: get(/royalties due/), marketingDue: get(/marketing fee/),
    expenses, totalOpex: get(/^total operating expense/), operatingIncome: get(/^operating income/),
    capex: get(/expenditures/), debtService: get(/^debt service/),
    explanations: notes.join('\n').trim() || null,
    checks: [],
  };
  const cashSubject = r.cashReceipts != null ? r.cashReceipts - (r.notSubject ?? 0) : null;
  r.checks = [
    { name: 'Classes add up to total tuition', ok: near(sum(tuition), r.tuitionTotal), detail: `${sum(tuition)} vs ${r.tuitionTotal}` },
    { name: 'Fees add up to total other billed', ok: near(sum(otherFees), r.otherTotal), detail: `${sum(otherFees)} vs ${r.otherTotal}` },
    { name: 'Tuition + other = revenue', ok: near((r.tuitionTotal ?? 0) + (r.otherTotal ?? 0), r.revenue), detail: `${(r.tuitionTotal ?? 0) + (r.otherTotal ?? 0)} vs ${r.revenue}` },
    { name: 'Expenses add up to total operating expense', ok: near(sum(expenses), r.totalOpex), detail: `${sum(expenses)} vs ${r.totalOpex}` },
    { name: 'Revenue − expenses = operating income', ok: near((r.revenue ?? 0) - (r.totalOpex ?? 0), r.operatingIncome), detail: `${(r.revenue ?? 0) - (r.totalOpex ?? 0)} vs ${r.operatingIncome}` },
    { name: 'Royalties due = 7% of cash receipts', ok: near(cashSubject == null ? null : cashSubject * 0.07, r.royaltiesDue, 3), detail: `${cashSubject == null ? '—' : Math.round(cashSubject * 0.07)} vs ${r.royaltiesDue}` },
  ];
  return r;
}
