import * as XLSX from 'xlsx';

// Reads an inventory-by-department export (Excel or CSV). Looks for a header row with a
// department column and an inventory cost/value column; quantity and retail are optional.
export type ParsedInv = { lines: { department: string; qty: number | null; cost_value: number; retail_value: number | null }[]; columns: string };

const DEPT = /^(dept\.?|department|category|dept name|department name|class)$/i;
const COST = /(ext\.?\s*cost|total\s*cost|cost\s*value|inventory\s*cost|inv\.?\s*cost|value\s*at\s*cost|^cost$|on\s*hand\s*cost|avg\.?\s*cost\s*value)/i;
const QTY = /(qty|quantity|on\s*hand|units|in\s*stock)/i;
const RETAIL = /(retail|ext\.?\s*price|price\s*value|selling\s*value)/i;

const toNum = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  if (!s) return null;
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-');
  const n = Number(s.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) && /\d/.test(s) ? (neg ? -n : n) : null;
};

export function parseInventory(bytes: Uint8Array): ParsedInv {
  const wb = XLSX.read(bytes, { type: 'array' });
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: null });
    for (let h = 0; h < Math.min(rows.length, 40); h++) {
      const head = (rows[h] ?? []).map((c) => String(c ?? '').trim());
      const d = head.findIndex((c) => DEPT.test(c));
      // prefer an explicit "extended/total cost" column over a unit cost
      const costCols = head.map((c, i) => [c, i] as const).filter(([c]) => COST.test(c));
      const c = (costCols.find(([t]) => /ext|total|value|on\s*hand/i.test(t)) ?? costCols[0])?.[1] ?? -1;
      if (d < 0 || c < 0) continue;
      const q = head.findIndex((t, i) => i !== c && QTY.test(t) && !COST.test(t));
      const r = head.findIndex((t, i) => i !== c && RETAIL.test(t));
      const lines = new Map<string, { department: string; qty: number | null; cost_value: number; retail_value: number | null }>();
      for (const row of rows.slice(h + 1)) {
        const dept = String(row?.[d] ?? '').trim();
        const cost = toNum(row?.[c]);
        if (!dept || cost == null || /^(grand\s*)?total/i.test(dept)) continue;
        const prev = lines.get(dept.toLowerCase());
        const qty = q >= 0 ? toNum(row?.[q]) : null, retail = r >= 0 ? toNum(row?.[r]) : null;
        // several rows per department (item-level export): add them up
        if (prev) { prev.cost_value += cost; prev.qty = (prev.qty ?? 0) + (qty ?? 0); prev.retail_value = retail == null ? prev.retail_value : (prev.retail_value ?? 0) + retail; }
        else lines.set(dept.toLowerCase(), { department: dept, qty, cost_value: cost, retail_value: retail });
      }
      if (lines.size) return { lines: [...lines.values()], columns: [head[d], head[c], q >= 0 ? head[q] : null, r >= 0 ? head[r] : null].filter(Boolean).join(' · ') };
    }
  }
  throw new Error('Couldn’t find a Department column and an inventory cost column. Send Claude a sample of the report so it can be read automatically, or type the numbers in below.');
}
