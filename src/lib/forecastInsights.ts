import type { Analysis, DeptRow } from './forecast';

// Plain-English "what stands out" for the Forecasting page. **text** = bold.
export type Insight = { kind: 'overall' | 'heavy' | 'light' | 'ok' | 'season' | 'cleanup' | 'data'; text: string };
type Cat = { category: string; value: number };

const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const pc = (n: number | null) => (n == null ? '—' : `${n.toFixed(n < 10 ? 1 : 0)}%`);
const k = (n: number) => (n >= 1000 ? `$${Math.round(n / 1000)}k` : usd(n));
const list = (xs: string[]) => (xs.length <= 1 ? xs.join('') : `${xs.slice(0, -1).join(', ')} and ${xs[xs.length - 1]}`);

export function insights(a: Analysis, categories: Record<string, Cat[]>, monthIso: string): Insight[] {
  const out: Insight[] = [];
  const catsOf = (r: DeptRow) => (categories[r.department.toLowerCase()] ?? []).filter((c) => !/unknown/i.test(c.category)).sort((x, y) => y.value - x.value);
  const counted = a.rows.filter((r) => r.inventory != null && r.status !== 'not_counted');

  // Overall
  if (a.turns != null) {
    const verdict = a.turns < 4 ? 'below the 4–6 a year a liquor store typically runs, so there’s likely cash sitting on the shelf'
      : a.turns > 6 ? 'faster than the typical 4–6 a year; watch for out-of-stocks' : 'within the typical 4–6 a year for a liquor store';
    out.push({ kind: 'overall', text: `**Overall: ${usd(a.totalInventory)} at cost**, about ${Math.round(a.daysOnHand ?? 0)} days of sales or **${a.turns.toFixed(1)} turns a year**, ${verdict}.${a.excess > 0 ? ` Departments above target hold about **${usd(a.excess)}** more than needed.` : ''}` });
  }

  // Heavy: biggest dollars above target (or share of inventory well above share of sales)
  const heavy = counted.filter((r) => r.status === 'over' && r.salesMix >= 1).sort((x, y) => (x.change ?? 0) - (y.change ?? 0));
  for (const r of heavy.slice(0, 3)) {
    const cats = catsOf(r).slice(0, 5);
    const share = (r.invMix ?? 0) > r.salesMix ? `${pc(r.salesMix)} of sales but ${pc(r.invMix)} of inventory, ` : '';
    out.push({ kind: 'heavy', text: `**${r.department} is heavy**: ${share}about ${Math.round(r.daysOnHand ?? 0)} days of stock (target ${r.targetDays}). Roughly **${usd(-(r.change ?? 0))}** more than needed at cost.${cats.length ? ` Biggest pools: ${list(cats.map((c) => `${titleCase(c.category)} ${k(c.value)}`))}. That’s where to trim orders first.` : ' Slow down buying until it sells through.'}` });
  }

  // Small departments holding a lot for what they sell (e.g. sparkling)
  const seasonal = /sparkling|champagne|prosecco/i;
  const m = Number(monthIso.slice(5, 7));
  for (const r of counted.filter((r) => r.status === 'over' && r.salesMix < 1 && (r.inventory ?? 0) >= 2000 && (r.salesMix >= 0.2 || seasonal.test(r.department))).sort((x, y) => (x.change ?? 0) - (y.change ?? 0)).slice(0, 3)) {
    const holiday = seasonal.test(r.department) && (m >= 10 || m === 1);
    out.push({ kind: holiday ? 'season' : 'heavy', text: holiday
      ? `**${r.department} looks heavy** (${usd(r.inventory ?? 0)} for ${pc(r.salesMix)} of sales), but December is its big month, so judge it after New Year’s rather than cutting now.`
      : `**${r.department}**: ${usd(r.inventory ?? 0)} on hand for only ${pc(r.salesMix)} of sales (about ${Math.round(r.daysOnHand ?? 0)} days). Hold off reordering.` });
  }

  // Light
  for (const r of counted.filter((r) => r.status === 'lean').sort((x, y) => (y.change ?? 0) - (x.change ?? 0)).slice(0, 3)) {
    out.push({ kind: 'light', text: `**${r.department} is running lean**: ${pc(r.salesMix)} of sales but only ${pc(r.invMix)} of inventory, about ${Math.round(r.daysOnHand ?? 0)} days. Adding about **${usd(r.change ?? 0)}** at cost avoids running out${r.margin != null ? ` (${pc(r.margin)} margin)` : ''}.` });
  }

  // Looks right
  const ok = counted.filter((r) => r.status === 'ok' && r.salesMix >= 1).map((r) => r.department);
  if (ok.length) out.push({ kind: 'ok', text: `**Looks right:** ${list(ok)}${ok.some((d) => /beer/i.test(d)) ? '. Beer always carries less inventory than its share of sales because it’s delivered weekly' : ''}.` });

  // Clean-ups
  const dead = counted.filter((r) => r.status === 'dead');
  const slow = counted.filter((r) => r.status === 'over' && r.salesMix < 0.2 && (r.inventory ?? 0) >= 1000 && !seasonal.test(r.department));
  // "-UNKNOWN-" only counts where the department also has real categories (otherwise the department just isn't split)
  const unknown = Object.values(categories).filter((cs) => cs.some((c) => !/unknown/i.test(c.category)))
    .flat().filter((c) => /unknown/i.test(c.category)).reduce((t, c) => t + c.value, 0);
  const bits = [
    ...dead.map((r) => `${usd(r.inventory ?? 0)} in ${r.department} with no sales`),
    ...slow.map((r) => `${usd(r.inventory ?? 0)} in ${r.department} that barely sells`),
  ];
  if (bits.length || unknown >= 1000) out.push({ kind: 'cleanup', text: `**Clean-ups:** ${bits.length ? `${list(bits)}: mark down, return or stop reordering.` : ''}${unknown >= 1000 ? ` About **${usd(unknown)}** is listed as “-UNKNOWN-” category; categorizing it in the POS sharpens this picture.` : ''}` });

  if (a.season > 1.08) out.push({ kind: 'season', text: `**Busy month ahead:** last year sales ran about ${Math.round((a.season - 1) * 100)}% higher per day next month, so the 30-day forecast is raised to match. Keep fast movers stocked.` });
  if (a.days < 60) out.push({ kind: 'data', text: `Based on ${a.days} days of department sales. Days-of-stock figures firm up with 60–90 days of data.` });
  return out;
}

function titleCase(s: string) {
  return s.toLowerCase().replace(/\b[a-z]/g, (c) => c.toUpperCase());
}
