// Reads the POS "Cash and Sales Summary" PDF (page 1) and the
// "Department wise Sales Summary" (page 2) into structured numbers,
// then runs consistency checks before anything is saved.
import { getDocumentProxy } from 'unpdf';

export type Cell = { x: number; y: number; text: string };
export type Row = { page: number; y: number; cells: Cell[] };

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
  netCashFlow: number;               // cash the close-out must match: Cash Sale (+) − Paidout (−). Safe drops are still the store's cash, so they're not taken off
  posNetCashFlow: number;            // "Net Cash-Flow" exactly as printed (after drops)
  cashSale: number;                  // CASH-FLOW ANALYSIS → Cash Sale (+)
  drops: number;                     // CASH-FLOW ANALYSIS → Drop (−): cash moved to the safe during the day
  posPaidOut: number;                // CASH-FLOW ANALYSIS → Paidout (-): cash paid out through the register (already taken off Net Cash-Flow)
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

export async function readRows(pdfBytes: Uint8Array): Promise<Row[]> {
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

function findLabelled(rows: Row[], label: RegExp, which: 'left' | 'right'): number | null {
  // Look on the expected side first, then the other side (the layout shifts a little day to day)
  for (const part of [which, which === 'left' ? 'right' : 'left'] as const) {
    for (const r of rows.filter(r => r.page === 1)) {
      const cells = side(r, part);
      const i = cells.findIndex(c => label.test(c.text));
      if (i >= 0) {
        const value = cells.slice(i + 1).reverse().find(c => isNumeric(c.text));
        if (value) return toNumber(value.text);
      }
    }
  }
  return null;
}

function labelled(rows: Row[], label: RegExp, which: 'left' | 'right' = 'left'): number {
  const v = findLabelled(rows, label, which);
  if (v == null) throw new Error(`Couldn't find "${label.source.replace(/\\/g, '')}" in the report`);
  return v;
}

// Lines the POS leaves out (or leaves blank) on days with nothing to report count as 0
const optional = (rows: Row[], label: RegExp, which: 'left' | 'right' = 'left') => findLabelled(rows, label, which) ?? 0;

export async function parseCashSalesSummary(pdfBytes: Uint8Array): Promise<CashSalesSummary> {
  const rows = await readRows(pdfBytes);
  const page1 = rows.filter(r => r.page === 1);

  const top = page1[0]?.cells.find(c => c.x < 150);
  const storeName = page1.flatMap(r => r.cells).filter(c => c.x < 150).sort((a, b) => b.y - a.y)[0]?.text ?? top?.text ?? '';

  // Business date: "For the day of 06-Oct-2026", or a store whose day runs overnight:
  // "From 12-Oct-2026 03:00 AM To 13-Oct-2026 02:59 AM" (the day is the From date).
  const page1Text = page1.flatMap(r => r.cells).map(c => c.text).join(' ').replace(/\s+/g, ' ');
  const DATE = '(\\d{2})-([A-Za-z]{3})-(\\d{4})';
  const iso = (d: string, mon: string, y: string) => `${y}-${MONTHS[mon.slice(0, 1).toUpperCase() + mon.slice(1, 3).toLowerCase()]}-${d}`;
  let businessDate: string;
  const day = page1Text.match(new RegExp(`For the day of\\s*${DATE}`, 'i'));
  const range = page1Text.match(new RegExp(`From\\s*${DATE}[^]*?To\\s*${DATE}`, 'i'));
  if (day) businessDate = iso(day[1], day[2], day[3]);
  else if (range) {
    businessDate = iso(range[1], range[2], range[3]);
    const to = iso(range[4], range[5], range[6]);
    const span = (Date.parse(to) - Date.parse(businessDate)) / 86400000;
    if (span > 1) throw new Error(`This report covers ${businessDate} to ${to}. Print one day at a time.`);
  } else throw new Error('Couldn\'t find the business date ("For the day of …" or "From … To …")');

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
    giftcardRedeemed: optional(rows, /Giftcard Redeemed/i),
    nonRevenue: optional(rows, /Total Non-Revenue Amt/i),
    grossSale: labelled(rows, /Gross Sale/i),
    taxes: labelled(rows, /^Taxes/i),
    netSales: labelled(rows, /Net Sales/i),
    cardTotal: labelled(rows, /Credit & Debit Card Total/i),
    netCashFlow: 0,
    posNetCashFlow: labelled(rows, /Net Cash-Flow/i, 'right'),
    cashSale: optional(rows, /^Cash Sale/i, 'right'),
    drops: Math.abs(optional(rows, /^Drop/i, 'right')),
    cashWithoutNonRevenue: optional(rows, /Total Cash Amount/i),
    cashTendered: tenders.find(t => /^cash$/i.test(t.type))?.amount ?? 0,
    posPaidOut: Math.abs(optional(rows, /^Paid\s*out\s*\(-\)|^Paidout/i, 'right') || optional(rows, /Paid-outs to Vendors/i)),
    transactions: labelled(rows, /Customer\(Transaction\) Count/i),
    averageSale: optional(rows, /Customer Average Sale/i),
    voidCount: optional(rows, /Delete\/Void Count/i),
    voidAmount: optional(rows, /Void\/Delete Amount/i),
    noSaleCount: optional(rows, /No Sale Count/i),
    discounts: optional(rows, /Total Discount/i),
    checks: [],
  };

  // Cash for the close-out. Older reports without a "Cash Sale (+)" line: printed Net Cash-Flow plus any drops.
  if (!s.cashSale) s.cashSale = cents(s.posNetCashFlow + s.drops + s.posPaidOut);
  s.netCashFlow = cents(s.cashSale - s.posPaidOut);
  const near = (a: number, b: number, tol = 0.05) => Math.abs(a - b) <= tol;
  const tenderSum = cents(tenders.reduce((t, x) => t + x.amount, 0));
  const cardSum = cents(tenders.filter(t => !/^cash$/i.test(t.type)).reduce((t, x) => t + x.amount, 0));
  const deptSum = cents(departments.reduce((t, d) => t + d.sales, 0));
  s.checks = [
    { name: 'Tenders add up to amount received', ok: near(tenderSum, s.grossReceived), detail: `${tenderSum} vs ${s.grossReceived}` },
    { name: 'Card types add up to card total', ok: near(cardSum, s.cardTotal), detail: `${cardSum} vs ${s.cardTotal}` },
    { name: 'Card + cash-flow + register paid-outs = amount received', ok: near(s.cardTotal + s.netCashFlow + s.posPaidOut, s.grossReceived), detail: `${cents(s.cardTotal + s.netCashFlow + s.posPaidOut)} vs ${s.grossReceived}` },
    { name: 'Cash-flow + register paid-outs = cash tendered', ok: near(s.netCashFlow + s.posPaidOut, s.cashTendered), detail: `${cents(s.netCashFlow + s.posPaidOut)} vs ${s.cashTendered}` },
    { name: 'Departments add up to department total', ok: near(deptSum, departmentTotals.sales), detail: `${deptSum} vs ${departmentTotals.sales}` },
    { name: 'Department total matches net sales', ok: near(departmentTotals.sales, s.netSales), detail: `${departmentTotals.sales} vs ${s.netSales}` },
    { name: 'Found at least one department', ok: departments.length > 0, detail: `${departments.length} departments` },
  ];
  return s;
}
