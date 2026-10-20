import { readRows } from '@/lib/pos/parseCashSalesSummary';

// POS "Inventory Value Analysis Report" (PDF): department → categories → "Total Value of <Dept> $x".
export type InvPdf = {
  storeName: string; asOf: string | null; grandTotal: number | null;
  lines: { department: string; qty: null; cost_value: number; retail_value: null; categories: { category: string; value: number }[] }[];
};

const NUM = /^\$?-?[\d,]+\.\d{2}$/;
const num = (s: string) => Number(s.replace(/[$,]/g, ''));

export async function parseInventoryPdf(bytes: Uint8Array): Promise<InvPdf> {
  const rows = await readRows(bytes);
  const text = (i: number) => rows[i].cells.map((c) => c.text).join(' ');
  if (!rows.some((_, i) => /Inventory Value Analysis Report/i.test(text(i)))) throw new Error('This isn’t an Inventory Value Analysis Report.');
  const storeName = rows[0]?.cells[0]?.text ?? '';
  let asOf: string | null = null;
  for (let i = 0; i < Math.min(rows.length, 10); i++) {
    const m = text(i).match(/As Of\s+(\d{1,2})\/(\d{1,2})\/(\d{4})/i);
    if (m) asOf = `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  }
  const lines: InvPdf['lines'] = [];
  let cats: { category: string; value: number }[] = [];
  let grandTotal: number | null = null;
  for (let i = 0; i < rows.length; i++) {
    const t = text(i);
    const cells = rows[i].cells;
    const last = cells[cells.length - 1]?.text ?? '';
    if (/^Total Value of\s+/i.test(t) && NUM.test(last)) {
      const department = t.replace(/^Total Value of\s+/i, '').replace(/\s*\$?-?[\d,]+\.\d{2}$/, '').trim();
      lines.push({ department, qty: null, cost_value: num(last), retail_value: null, categories: cats.filter((c) => c.value !== 0) });
      cats = [];
    } else if (/^GRAND TOTAL/i.test(t) && NUM.test(last)) {
      grandTotal = num(last);
    } else if (cells.length === 2 && cells[0].x > 100 && NUM.test(last)) {
      cats.push({ category: cells[0].text, value: num(last) });
    } else if (cells.length === 1 && cells[0].x < 100 && !/^Department$/i.test(t)) {
      cats = [];   // a new department heading
    }
  }
  if (!lines.length) throw new Error('No “Total Value of …” lines found in the report.');
  return { storeName, asOf, grandTotal, lines };
}
