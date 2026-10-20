// Inventory vs. sales by department: days on hand, turns, GMROI, mix, and a
// suggested stock level per department, with a simple 30-day forecast.

export type DeptSale = { department: string; business_date: string; sales: number; cost: number; profit: number; qty: number };
export type InvLine = { department: string; qty: number | null; cost_value: number; retail_value: number | null };

export type Status = 'dead' | 'over' | 'lean' | 'ok' | 'not_counted';
export type DeptRow = {
  department: string;
  sales: number; cost: number; profit: number; qty: number;
  salesMix: number;            // % of store sales in the window
  margin: number | null;       // gross margin %
  cogsPerDay: number;          // cost of goods sold per selling day
  inventory: number | null;    // on hand at cost
  invMix: number | null;       // % of total inventory dollars
  daysOnHand: number | null;
  turns: number | null;        // per year
  gmroi: number | null;        // yearly gross profit ÷ inventory at cost
  targetDays: number;
  target: number;              // inventory at cost for the target days
  change: number | null;       // + add / − reduce, at cost
  forecastSales30: number;     // expected sales next 30 days
  forecastCost30: number;      // cost of those sales
  status: Status;
};

export type Analysis = {
  rows: DeptRow[];
  days: number;                // selling days with POS data in the window
  from: string | null; to: string | null;
  totalSales: number; totalInventory: number; totalCogsPerDay: number;
  daysOnHand: number | null; turns: number | null;
  excess: number;              // dollars above target in overstocked + dead departments
  short: number;               // dollars needed in lean departments
  season: number;              // seasonal factor used for the next 30 days
};

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

export function analyze(sales: DeptSale[], inventory: InvLine[] | null, opts: { targetDays: (department: string) => number; season: number }): Analysis {
  const dates = [...new Set(sales.map((s) => s.business_date))].sort();
  const days = dates.length;
  const byDept = new Map<string, { name: string; sales: number; cost: number; profit: number; qty: number }>();
  for (const s of sales) {
    const k = norm(s.department);
    const d = byDept.get(k) ?? { name: s.department, sales: 0, cost: 0, profit: 0, qty: 0 };
    d.sales += s.sales; d.cost += s.cost; d.profit += s.profit; d.qty += s.qty;
    byDept.set(k, d);
  }
  const inv = new Map<string, InvLine>();
  for (const l of inventory ?? []) inv.set(norm(l.department), l);
  const keys = [...new Set([...byDept.keys(), ...inv.keys()])];
  const totalSales = [...byDept.values()].reduce((a, d) => a + d.sales, 0);
  const totalInventory = (inventory ?? []).reduce((a, l) => a + l.cost_value, 0);

  const rows: DeptRow[] = keys.map((k) => {
    const d = byDept.get(k) ?? { name: inv.get(k)!.department, sales: 0, cost: 0, profit: 0, qty: 0 };
    const line = inv.get(k);
    const t = opts.targetDays(d.name);
    const cogsPerDay = days ? d.cost / days : 0;
    const inventoryAt = inventory ? line?.cost_value ?? 0 : null;
    const daysOnHand = inventoryAt != null && cogsPerDay > 0 ? inventoryAt / cogsPerDay : null;
    const target = cogsPerDay * t;
    const yearlyProfit = days ? (d.profit / days) * 365 : 0;
    let status: Status = 'ok';
    if (inventory && !line) status = 'not_counted';
    else if (inventoryAt != null && inventoryAt > 0 && d.sales <= 0) status = 'dead';
    else if (daysOnHand != null && daysOnHand > t * 1.5) status = 'over';
    else if (daysOnHand != null && daysOnHand < t * 0.5) status = 'lean';
    return {
      department: d.name, sales: d.sales, cost: d.cost, profit: d.profit, qty: d.qty,
      salesMix: totalSales ? (d.sales / totalSales) * 100 : 0,
      margin: d.sales ? (d.profit / d.sales) * 100 : null,
      cogsPerDay,
      inventory: inventoryAt,
      invMix: inventoryAt != null && totalInventory ? (inventoryAt / totalInventory) * 100 : null,
      daysOnHand,
      turns: daysOnHand ? 365 / daysOnHand : null,
      gmroi: inventoryAt ? yearlyProfit / inventoryAt : null,
      targetDays: t, target,
      change: inventoryAt != null && status !== 'not_counted' ? (status === 'ok' ? 0 : target - inventoryAt) : null,
      forecastSales30: days ? (d.sales / days) * 30 * opts.season : 0,
      forecastCost30: days ? (d.cost / days) * 30 * opts.season : 0,
      status,
    };
  }).sort((a, b) => b.sales - a.sales || (b.inventory ?? 0) - (a.inventory ?? 0));

  const totalCogsPerDay = rows.reduce((a, r) => a + r.cogsPerDay, 0);
  const doh = inventory && totalCogsPerDay ? totalInventory / totalCogsPerDay : null;
  return {
    rows, days, from: dates[0] ?? null, to: dates[dates.length - 1] ?? null,
    totalSales, totalInventory, totalCogsPerDay,
    daysOnHand: doh, turns: doh ? 365 / doh : null,
    excess: rows.filter((r) => r.status === 'over' || r.status === 'dead').reduce((a, r) => a + Math.max(0, -(r.change ?? 0)), 0),
    short: rows.filter((r) => r.status === 'lean').reduce((a, r) => a + Math.max(0, r.change ?? 0), 0),
    season: opts.season,
  };
}

// Next 30 days vs the recent window, from last year's monthly totals for this store
// (e.g. December runs ~1.4× October). 1 when there's no history.
export function seasonFactor(hist: { month: string; revenue: number }[], windowEnd: string): number {
  const ym = (iso: string, k: number) => { const d = new Date(`${iso.slice(0, 7)}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + k); return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-01`; };
  const lastYearNow = hist.find((h) => h.month === ym(windowEnd, -12))?.revenue;
  const lastYearNext = hist.find((h) => h.month === ym(windowEnd, -11))?.revenue;
  if (!lastYearNow || !lastYearNext) return 1;
  const dim = (iso: string) => new Date(Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)), 0)).getUTCDate();
  const f = (lastYearNext / dim(ym(windowEnd, -11))) / (lastYearNow / dim(ym(windowEnd, -12)));   // per day
  return Math.min(2, Math.max(0.5, f));
}

// Typical days of stock to hold: beer and mixers turn fast, wine slowly.
export const DEFAULT_TARGET_DAYS: [RegExp, number][] = [
  [/beer|ice|mixer|soda|snack|non-?alc|water|juice/i, 14],
  [/sparkling|champagne|wine/i, 60],
  [/liquor|spirit|whisk|vodka|tequila|rum|gin|cordial/i, 45],
];
export function targetDaysFor(department: string, saved: Record<string, number>): number {
  const k = norm(department);
  if (saved[k] && saved[k] > 0) return saved[k];
  return DEFAULT_TARGET_DAYS.find(([re]) => re.test(department))?.[1] ?? 30;
}
export { norm as normDept };
