// Reads the POS "Cash and Sales Summary" PDF (page 1) and the
// "Department wise Sales Summary" (page 2) into structured numbers,
// then runs consistency checks before anything is saved.
import { getDocumentProxy } from 'unpdf';

type Cell = { x: number; y: number; text: string };
type Row = { page: number; y: number; cells: Cell[] };

export type Tender = { type: string; count: number; amount: number };
export type HourlySale = { period: string; count: number; amount: number };
export type DepartmentSale = {
  department: string; qty: number; sales: number; cost: number;
  profit: number; profitPct: number; salesPct: number | null;
};
export type Check = { name: string; ok: boolean; detail: string };

export type CashSalesSummary = {
  storeName: string;
  businessDate: string;              // YYYY-MM-DD
  tenders: Tender[];
  grossReceived: number;
  giftcardRedeemed: number;
  nonRevenue: number;
  grossSale: number;
  taxes: number;
  netSales: number;
  cardTotal: number;
  netCashFlow: number;               // CASH-FLOW ANALYSIS → Net Cash-Flow: the cash the drawer must match
  cashWithoutNonRevenue: number;
  cashTendered: number;
  transactions: number;
  averageSale: number;
  voidCount: number;
  voidAmount: number;
  noSaleCount: number;
  discounts: number;
  hourly: HourlySale[];
  departments: DepartmentSale[];
  departmentTotals: { qty: number; sales: number; cost: number; profit: number; profitPct: number };
  checks: Check[];
};

const MONTHS: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
};

export function toNumber(s: string): number {
  const n = Number(s.replace(/[$,%\s]/g, ''));
  if (Number.isNaN(n)) throw new Error(`Not a number: "${s}"`);
  return n;
}
const isNumeric = (s: string) => /^-?\$?-?[\d,]*\.?\d+%?$/.test(s.trim());
const cents = (n: number) => Math.round(n * 100) / 100;

async function readRows(pdfBytes: Uint8Array): Promise<Row[]> {
  const pdf = await getDocumentProxy(pdfBytes);
  const rows: Row[] = [];
  for (let p = 1; p <= pdf.numPages; p++) {
    const content = await (await pdf.getPage(p)).getTextContent();
    const cells: Cell[] = [];
    for (const item of content.items as Array<{ str: string; transform: number[] }>) {
      const text = item.str.trim();
      if (text) cells.push({ x: item.transform[4], y: item.transform[5], text });
    }
    cells.sort((a, b) => b.y - a.y || a.x - b.x);
    for (const c of cells) {
      const row = rows.find(r => r.page === p && Math.abs(r.y - c.y) <= 3);
      if (row) row.cells.push(c); else rows.push({ page: p, y: c.y, cells: [c] });
    }
  }
  for (const r of rows) r.cells.sort((a, b) => a.x - b.x);
  return rows.sort((a, b) => a.page - b.page || b.y - a.y);
}

// Page 1 is two columns: left (x < 300) and right (x >= 300).
const side = (r: Row, which: 'left' | 'right') =>
  r.cells.filter(c => (which === 'left' ? c.x < 300 : c.x >= 300));

function labelled(rows: Row[], label: RegExp, which: 'left' | 'right' = 'left'): number {
  for (const r of rows.filter(r => r.page === 1)) {
    const cells = side(r, which);
    const i = cells.findIndex(c => label.test(c.text));
    if (i >= 0) {
      const value = cells.slice(i + 1).reverse().find(c => isNumeric(c.text));
      if (value) return toNumber(value.text);
    }
  }
  throw new Error(`Couldn't find "${label.source}" in the report`);
}

export async function parseCashSalesSummary(pdfBytes: Uint8Array): Promise<CashSalesSummary> {
  const rows = await readRows(pdfBytes);
  const page1 = rows.filter(r => r.page === 1);

  const top = page1[0]?.cells.find(c => c.x < 150);
  const storeName = page1.flatMap(r => r.cells).filter(c => c.x < 150).sort((a, b) => b.y - a.y)[0]?.text ?? top?.text ?? '';

  const dateCell = page1.flatMap(r => r.cells).find(c => /For the day of/i.test(c.text));
  const m = dateCell?.text.match(/(\d{2})-([A-Za-z]{3})-(\d{4})/);
  if (!m) throw new Error('Couldn\'t find the business date ("For the day of …")');
  const businessDate = `${m[3]}-${MONTHS[m[2]]}-${m[1]}`;

  // Tender table: left-side rows between "TENDER TYPE" header and "Gross Amt Received"
  const headerY = page1.find(r => side(r, 'left').some(c => /^TENDER TYPE$/i.test(c.text)))?.y;
  const grossY = page1.find(r => side(r, 'left').some(c => /Gross Amt Received/i.test(c.text)))?.y;
  if (headerY === undefined || grossY === undefined) throw new Error('Couldn\'t find the tender table');
  const tenders: Tender[] = page1
    .filter(r => r.y < headerY && r.y > grossY + 3)
    .map(r => side(r, 'left'))
    .filter(c => c.length === 3 && !isNumeric(c[0].text))
    .map(c => ({ type: c[0].text, count: toNumber(c[1].text), amount: toNumber(c[2].text) }));

  const hourly: HourlySale[] = page1
    .map(r => side(r, 'right'))
    .filter(c => c.length === 3 && /\d{2}:\d{2} [AP]M To/.test(c[0].text))
    .map(c => ({ period: c[0].text, count: toNumber(c[1].text), amount: toNumber(c[2].text) }));

  // Departments (page 2): name, qty, price, cost, profit, % profit, % sales
  const departments: DepartmentSale[] = [];
  let departmentTotals = { qty: 0, sales: 0, cost: 0, profit: 0, profitPct: 0 };
  for (const r of rows.filter(r => r.page === 2)) {
    const name = r.cells.filter(c => c.x < 150 && !isNumeric(c.text)).map(c => c.text).join(' ');
    const nums = r.cells.filter(c => c.x >= 150 && isNumeric(c.text)).map(c => toNumber(c.text));
    if (!name || name === 'Department') continue;
    if (/^Total$/i.test(name) && nums.length >= 5) {
      departmentTotals = { qty: nums[0], sales: nums[1], cost: nums[2], profit: nums[3], profitPct: nums[4] };
    } else if (nums.length === 6) {
      departments.push({ department: name, qty: nums[0], sales: nums[1], cost: nums[2],
        profit: nums[3], profitPct: nums[4], salesPct: nums[5] });
    }
  }

  const s: CashSalesSummary = {
    storeName, businessDate, tenders, hourly, departments, departmentTotals,
    grossReceived: labelled(rows, /Gross Amt Received/i),
    giftcardRedeemed: labelled(rows, /Giftcard Redeemed/i),
    nonRevenue: labelled(rows, /Total Non-Revenue Amt/i),
    grossSale: labelled(rows, /Gross Sale/i),
    taxes: labelled(rows, /^Taxes/i),
    netSales: labelled(rows, /Net Sales/i),
    cardTotal: labelled(rows, /Credit & Debit Card Total/i),
    netCashFlow: labelled(rows, /Net Cash-Flow/i, 'right'),
    cashWithoutNonRevenue: labelled(rows, /Total Cash Amount/i),
    cashTendered: tenders.find(t => /^cash$/i.test(t.type))?.amount ?? 0,
    transactions: labelled(rows, /Customer\(Transaction\) Count/i),
    averageSale: labelled(rows, /Customer Average Sale/i),
    voidCount: labelled(rows, /Delete\/Void Count/i),
    voidAmount: labelled(rows, /Void\/Delete Amount/i),
    noSaleCount: labelled(rows, /No Sale Count/i),
    discounts: labelled(rows, /Total Discount/i),
    checks: [],
  };

  const near = (a: number, b: number, tol = 0.05) => Math.abs(a - b) <= tol;
  const tenderSum = cents(tenders.reduce((t, x) => t + x.amount, 0));
  const cardSum = cents(tenders.filter(t => !/^cash$/i.test(t.type)).reduce((t, x) => t + x.amount, 0));
  const deptSum = cents(departments.reduce((t, d) => t + d.sales, 0));
  s.checks = [
    { name: 'Tenders add up to amount received', ok: near(tenderSum, s.grossReceived), detail: `${tenderSum} vs ${s.grossReceived}` },
    { name: 'Card types add up to card total', ok: near(cardSum, s.cardTotal), detail: `${cardSum} vs ${s.cardTotal}` },
    { name: 'Card + cash-flow = amount received', ok: near(s.cardTotal + s.netCashFlow, s.grossReceived), detail: `${cents(s.cardTotal + s.netCashFlow)} vs ${s.grossReceived}` },
    { name: 'Cash-flow matches cash tendered', ok: near(s.netCashFlow, s.cashTendered), detail: `${s.netCashFlow} vs ${s.cashTendered}` },
    { name: 'Departments add up to department total', ok: near(deptSum, departmentTotals.sales), detail: `${deptSum} vs ${departmentTotals.sales}` },
    { name: 'Department total matches net sales', ok: near(departmentTotals.sales, s.netSales), detail: `${departmentTotals.sales} vs ${s.netSales}` },
    { name: 'Found at least one department', ok: departments.length > 0, detail: `${departments.length} departments` },
  ];
  return s;
}
