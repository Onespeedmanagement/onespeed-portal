// Reads the "Monthly Store Performance Report" (Google Sheets PDF): for each
// month, one column per store (CWS, FF, UP, Suburban …) with Prev Yr / Current
// Yr avg ticket, customer count, percentage profit and revenue.
import { readRows, type Cell } from '@/lib/pos/parseCashSalesSummary';

export type MonthTotals = {
  code: string;            // store column heading, e.g. "CWS"
  month: string;           // YYYY-MM-01
  revenue: number;
  customers: number | null;
  profitPct: number | null;
  ticket: number | null;
  warning?: string;
};

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const LABEL = /^(prev\w*|cur+\w*)\s*y(?:ea)?r\s+(.+)$/i;
const NUMBER = /^-?\$?\s*-?[\d,]*\.?\d+%?$/;
const num = (s: string) => Number(s.replace(/[$,%\s]/g, ''));

function metricOf(text: string): keyof Omit<MonthTotals, 'code' | 'month' | 'warning'> | null {
  const t = text.toLowerCase();
  if (t.includes('ticket')) return 'ticket';
  if (t.includes('customer')) return 'customers';
  if (t.includes('profit')) return 'profitPct';
  if (t.includes('revenue') || t.includes('sales')) return 'revenue';
  return null;
}

export async function parseMonthlyReport(pdfBytes: Uint8Array, currentYear: number): Promise<MonthTotals[]> {
  const rows = await readRows(pdfBytes);
  const out = new Map<string, Partial<MonthTotals> & { code: string; month: string }>();
  let month = -1;
  let headers: Cell[] = [];

  for (const r of rows) {
    const texts = r.cells.map((c) => c.text);
    if (texts.length === 1 && MONTHS.includes(texts[0].toLowerCase())) { month = MONTHS.indexOf(texts[0].toLowerCase()) + 1; continue; }
    if (texts.length >= 2 && r.cells.every((c) => !NUMBER.test(c.text) && !LABEL.test(c.text) && !/differ/i.test(c.text))) { headers = r.cells; continue; }
    if (month < 1 || headers.length === 0) continue;

    const labels = r.cells.filter((c) => LABEL.test(c.text));
    labels.forEach((lab, i) => {
      const [, which, rest] = lab.text.match(LABEL)!;
      const metric = metricOf(rest);
      if (!metric) return;
      const col = [...headers].reverse().find((h) => h.x <= lab.x + 5);
      if (!col) return;
      const nextHeader = headers.find((h) => h.x > col.x + 5);
      const spacing = headers.length > 1 ? headers[1].x - headers[0].x : 120;
      const limit = Math.min(labels[i + 1]?.x ?? Infinity, nextHeader?.x ?? col.x + spacing);
      const valueCell = r.cells.find((c) => c.x > lab.x && c.x < limit && NUMBER.test(c.text));
      if (!valueCell) return;
      let v = num(valueCell.text);
      if (Number.isNaN(v)) return;
      if (metric === 'profitPct' && v > 0 && v <= 1) v *= 100;
      const year = /^prev/i.test(which) ? currentYear - 1 : currentYear;
      const iso = `${year}-${String(month).padStart(2, '0')}-01`;
      const key = `${col.text}|${iso}`;
      const rec = out.get(key) ?? { code: col.text, month: iso };
      rec[metric] = v;
      out.set(key, rec);
    });
  }

  const result: MonthTotals[] = [];
  for (const r of out.values()) {
    if (r.revenue == null || r.revenue <= 0) continue;
    const t: MonthTotals = { code: r.code, month: r.month, revenue: r.revenue, customers: r.customers ?? null, profitPct: r.profitPct ?? null, ticket: r.ticket ?? null };
    if (t.customers && t.ticket) {
      const implied = t.revenue / t.customers;
      if (Math.abs(implied - t.ticket) / t.ticket > 0.05) t.warning = `Avg ticket ${t.ticket} doesn't match revenue ÷ customers (${implied.toFixed(2)})`;
    }
    result.push(t);
  }
  return result.sort((a, b) => a.code.localeCompare(b.code) || a.month.localeCompare(b.month));
}
