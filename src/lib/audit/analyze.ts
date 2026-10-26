import { NOT_EXPENSES, SERVICE_CATEGORIES } from './categorize';

export type AT = {
  id: number; source: 'amazon' | 'chase' | 'register'; business_id: string | null; txn_date: string;
  vendor: string | null; item: string | null; item_key: string | null; qty: number | null; unit_price: number | null;
  amount: number; category: string; ref: string | null;
};
export type Store = { id: string; name: string };

const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
export const yearly = (amount: number, from: string, to: string) => amount * (365 / Math.max(30, daysBetween(from, to) + 1));
const month = (d: string) => d.slice(0, 7);
// "NETFLIX.COM 866-579-7172 CA" and "NETFLIX.COM 800-..." → "netflix com"
export const vendorKey = (v: string | null) => (v ?? '').toLowerCase().replace(/[#*]+\S*/g, ' ').replace(/\d[\d\-./]*/g, ' ').replace(/\b(ca|ny|nj|de|pa|md|wa|tx|fl|il|ma|usa|us|inc|llc|com)\b/g, ' ').replace(/[^a-z&]+/g, ' ').trim().split(' ').slice(0, 3).join(' ');

export function range(txns: AT[]) {
  const d = txns.map((t) => t.txn_date).sort();
  return { from: d[0] ?? null, to: d[d.length - 1] ?? null };
}

// Spend by category for each store (and all stores), with % of that store's total
export function byCategory(txns: AT[], stores: Store[]) {
  const cats = new Map<string, Map<string, number>>();   // category → store id ('*' = no store) → amount
  const totals = new Map<string, number>();
  for (const t of txns) {
    const s = t.business_id ?? '*';
    const m = cats.get(t.category) ?? new Map<string, number>();
    m.set(s, (m.get(s) ?? 0) + t.amount); cats.set(t.category, m);
    totals.set(s, (totals.get(s) ?? 0) + t.amount);
  }
  const cols = [...stores.filter((s) => totals.has(s.id)), ...(totals.has('*') ? [{ id: '*', name: 'Company / not assigned' }] : [])];
  const grand = [...totals.values()].reduce((a, b) => a + b, 0);
  const rows = [...cats.entries()].map(([category, m]) => {
    const all = [...m.values()].reduce((a, b) => a + b, 0);
    return { category, all, pct: grand ? (all / grand) * 100 : 0, byStore: cols.map((c) => ({ id: c.id, amount: m.get(c.id) ?? 0, pct: totals.get(c.id) ? ((m.get(c.id) ?? 0) / totals.get(c.id)!) * 100 : 0 })) };
  }).sort((a, b) => b.all - a.all);
  return { cols, rows, totals: cols.map((c) => totals.get(c.id) ?? 0), grand };
}

// Amazon: items bought most often / most spent on
export function topItems(txns: AT[], stores: Store[]) {
  const by = new Map<string, AT[]>();
  for (const t of txns) if (t.source === 'amazon' && t.amount > 0) { const k = t.item_key ?? t.item ?? '?'; by.set(k, [...(by.get(k) ?? []), t]); }
  const r = range(txns.filter((t) => t.source === 'amazon'));
  return [...by.entries()].map(([key, ts]) => {
    ts.sort((a, b) => a.txn_date.localeCompare(b.txn_date));
    const orders = new Set(ts.map((t) => t.ref ?? t.txn_date)).size;
    const qty = ts.reduce((a, t) => a + (t.qty ?? 1), 0);
    const spend = ts.reduce((a, t) => a + t.amount, 0);
    const prices = ts.map((t) => t.unit_price ?? t.amount / (t.qty || 1));
    const firstP = prices[0], lastP = prices[prices.length - 1];
    const perStore = stores.map((s) => {
      const mine = ts.filter((t) => t.business_id === s.id);
      return { id: s.id, name: s.name, spend: mine.reduce((a, t) => a + t.amount, 0), qty: mine.reduce((a, t) => a + (t.qty ?? 1), 0),
        avgPrice: mine.length ? mine.reduce((a, t) => a + (t.unit_price ?? t.amount / (t.qty || 1)), 0) / mine.length : null };
    }).filter((p) => p.spend > 0);
    const gaps = ts.slice(1).map((t, i) => daysBetween(ts[i].txn_date, t.txn_date)).filter((g) => g > 0);
    return {
      key, title: ts[ts.length - 1].item ?? key, category: ts[0].category, orders, qty, spend,
      yearlySpend: r.from && r.to ? yearly(spend, r.from, r.to) : spend, yearlyQty: r.from && r.to ? yearly(qty, r.from, r.to) : qty,
      avgPrice: prices.reduce((a, b) => a + b, 0) / prices.length, minPrice: Math.min(...prices), maxPrice: Math.max(...prices),
      creep: firstP ? ((lastP - firstP) / firstP) * 100 : 0,
      everyDays: gaps.length ? Math.round(gaps.reduce((a, b) => a + b, 0) / gaps.length) : null,
      avgQty: qty / Math.max(1, orders), perStore,
    };
  }).sort((a, b) => b.spend - a.spend);
}

export type Flag = { key: string; kind: 'duplicate' | 'subscription' | 'personal' | 'too_often' | 'price_up' | 'store_price' | 'spike'; source: AT['source']; business_id: string | null; title: string; detail: string; amount: number; yearly?: number };

export function flags(txns: AT[], stores: Store[]): Flag[] {
  const name = (id: string | null) => stores.find((s) => s.id === id)?.name ?? 'Company card';
  const out: Flag[] = [];
  const spendable = txns.filter((t) => !NOT_EXPENSES.includes(t.category) && t.amount > 0);

  // Same vendor + same amount within 3 days (cards / bank); same Amazon item twice in 3 days at one store
  const sorted = [...spendable].sort((a, b) => a.txn_date.localeCompare(b.txn_date));
  for (let i = 0; i < sorted.length; i++) for (let j = i + 1; j < sorted.length && daysBetween(sorted[i].txn_date, sorted[j].txn_date) <= 3; j++) {
    const a = sorted[i], b = sorted[j];
    if (a.source !== b.source || a.business_id !== b.business_id || a.amount !== b.amount || a.amount < 10) continue;
    const same = a.source === 'amazon' ? a.item_key === b.item_key && a.ref !== b.ref : vendorKey(a.vendor) === vendorKey(b.vendor);
    if (!same) continue;
    out.push({ key: `dup:${a.id}:${b.id}`, kind: 'duplicate', source: a.source, business_id: a.business_id, title: a.source === 'amazon' ? (a.item ?? '') : (a.vendor ?? ''),
      detail: `${usd(a.amount)} on ${a.txn_date} and again on ${b.txn_date}${a.source === 'amazon' ? ' (separate orders)' : ''} · ${name(a.business_id)}`, amount: a.amount });
  }

  // Recurring charges (cards): same vendor in 3+ months at a similar amount
  const recur = new Map<string, AT[]>();
  for (const t of spendable) if (t.source === 'chase') { const k = `${t.business_id}|${vendorKey(t.vendor)}`; recur.set(k, [...(recur.get(k) ?? []), t]); }
  for (const [k, ts] of recur) {
    const months = new Set(ts.map((t) => month(t.txn_date)));
    if (months.size < 3) continue;
    const amounts = ts.map((t) => t.amount).sort((a, b) => a - b);
    const median = amounts[Math.floor(amounts.length / 2)];
    const steady = ts.filter((t) => Math.abs(t.amount - median) <= Math.max(2, median * 0.15)).length >= ts.length * 0.6;
    if (!steady) continue;
    const perMonth = ts.reduce((a, t) => a + t.amount, 0) / months.size;
    const last = [...ts].sort((a, b) => a.txn_date.localeCompare(b.txn_date));
    const up = last.length > 1 && last[last.length - 1].amount > last[0].amount * 1.05;
    out.push({ key: `sub:${k}`, kind: 'subscription', source: 'chase', business_id: ts[0].business_id, title: ts[0].vendor ?? '',
      detail: `about ${usd(perMonth)} a month for ${months.size} months (${ts[0].category})${up ? `, up from ${usd(last[0].amount)} to ${usd(last[last.length - 1].amount)}` : ''} · ${name(ts[0].business_id)}`,
      amount: perMonth, yearly: perMonth * 12 });
  }

  // Personal-looking or unclear card charges, grouped by merchant
  const pers = new Map<string, AT[]>();
  for (const t of spendable) if (t.source !== 'amazon' && (t.category === 'Personal or unclear' || t.category === 'Meals' || (t.category === 'Other' && t.source === 'chase' && t.amount >= 100))) {
    const k = `${t.business_id}|${vendorKey(t.vendor)}`; pers.set(k, [...(pers.get(k) ?? []), t]);
  }
  for (const [k, ts] of pers) {
    const total = ts.reduce((a, t) => a + t.amount, 0);
    ts.sort((a, b) => a.txn_date.localeCompare(b.txn_date));
    out.push({ key: `per:${k}`, kind: 'personal', source: ts[0].source, business_id: ts[0].business_id, title: ts[0].vendor ?? '',
      detail: `${ts.length > 1 ? `${ts.length} charges, ${usd(total)} (${ts[0].txn_date} – ${ts[ts.length - 1].txn_date})` : `${usd(total)} on ${ts[0].txn_date}`} · ${ts[0].category === 'Other' ? 'not clear what this is' : ts[0].category} · ${name(ts[0].business_id)}`, amount: total });
  }

  // Amazon: bought often in small amounts (bulk candidates), prices creeping up, one store paying more
  for (const it of topItems(spendable, stores)) {
    if (it.orders >= 5 && it.avgQty <= 3 && it.yearlySpend >= 100) out.push({ key: `often:${it.key}`, kind: 'too_often', source: 'amazon', business_id: null, title: it.title,
      detail: `ordered ${it.orders} times, about ${it.avgQty.toFixed(1)} at a time${it.everyDays ? ` (every ~${it.everyDays} days)` : ''}; ${usd(it.yearlySpend)} a year. Buying in bulk usually cuts the unit price.`, amount: it.spend, yearly: it.yearlySpend });
    if (it.orders >= 3 && it.creep >= 10) out.push({ key: `up:${it.key}`, kind: 'price_up', source: 'amazon', business_id: null, title: it.title,
      detail: `price went from ${usd(it.minPrice)} to ${usd(it.maxPrice)} (+${it.creep.toFixed(0)}%)`, amount: it.spend });
    const priced = it.perStore.filter((p) => p.avgPrice != null);
    if (priced.length >= 2) {
      const lo = priced.reduce((a, b) => (a.avgPrice! < b.avgPrice! ? a : b)), hi = priced.reduce((a, b) => (a.avgPrice! > b.avgPrice! ? a : b));
      if (hi.avgPrice! > lo.avgPrice! * 1.15) out.push({ key: `sp:${it.key}`, kind: 'store_price', source: 'amazon', business_id: hi.id, title: it.title,
        detail: `${hi.name} pays ${usd(hi.avgPrice!)} each, ${lo.name} pays ${usd(lo.avgPrice!)}`, amount: (hi.avgPrice! - lo.avgPrice!) * hi.qty });
    }
  }

  // Month where a category ran 60%+ above its usual month
  const cm = new Map<string, Map<string, number>>();
  for (const t of spendable) if (t.source !== 'amazon') { const k = `${t.business_id}|${t.category}`; const m = cm.get(k) ?? new Map(); m.set(month(t.txn_date), (m.get(month(t.txn_date)) ?? 0) + t.amount); cm.set(k, m); }
  for (const [k, m] of cm) {
    if (m.size < 4) continue;
    const vals = [...m.values()].sort((a, b) => a - b), med = vals[Math.floor(vals.length / 2)];
    for (const [mo, v] of m) if (v > med * 1.6 && v - med > 300) {
      const [biz, cat] = k.split('|');
      out.push({ key: `spike:${k}:${mo}`, kind: 'spike', source: 'chase', business_id: biz === 'null' ? null : biz, title: cat,
        detail: `${usd(v)} in ${mo} vs a usual ${usd(med)} · ${name(biz === 'null' ? null : biz)}`, amount: v - med });
    }
  }
  return out;
}

// Store services: monthly cost per store, and how far each store is above the cheapest
export function services(txns: AT[], stores: Store[]) {
  return SERVICE_CATEGORIES.map((category) => {
    const per = stores.map((s) => {
      const mine = txns.filter((t) => t.business_id === s.id && t.category === category && t.amount > 0 && t.source !== 'amazon');
      const all = txns.filter((t) => t.business_id === s.id && t.source !== 'amazon');
      const r = range(all);
      const months = r.from && r.to ? Math.max(1, Math.round(daysBetween(r.from, r.to) / 30.4)) : 1;
      const total = mine.reduce((a, t) => a + t.amount, 0);
      const vendors = [...new Set(mine.map((t) => t.vendor ?? '—'))];
      return { id: s.id, name: s.name, total, perMonth: mine.length ? total / months : null, vendors, months };
    }).filter((p) => p.perMonth != null);
    const lowest = per.length ? Math.min(...per.map((p) => p.perMonth!)) : 0;
    return { category, stores: per.map((p) => ({ ...p, overLowest: p.perMonth! - lowest, overPct: lowest ? ((p.perMonth! - lowest) / lowest) * 100 : 0 })), lowest };
  }).filter((s) => s.stores.length > 0);
}

export const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: n < 100 ? 2 : 0 });

export type Opportunity = { title: string; perYear: number | null; action: string; detail: string; tab: 'amazon' | 'chase' | 'expenses' };

// The summary at the top: biggest savings first, each with a rough yearly figure and what to do
export function opportunities(txns: AT[], stores: Store[], fl: Flag[], alt: { item_key: string; supplier: string; unit_price: number }[], cardSales: { business_id: string; amount: number; from: string; to: string }[]): Opportunity[] {
  const out: Opportunity[] = [];

  // Card processing fees vs card sales from the POS reports
  for (const s of stores) {
    const fees = txns.filter((t) => t.business_id === s.id && t.category === 'Card processing fees');
    const cs = cardSales.find((c) => c.business_id === s.id);
    if (!fees.length) continue;
    const r = range(fees);
    const feesYear = yearly(fees.reduce((a, t) => a + t.amount, 0), r.from!, r.to!);
    const cardYear = cs && cs.amount > 0 ? yearly(cs.amount, cs.from, cs.to) : null;
    const rate = cardYear ? (feesYear / cardYear) * 100 : null;
    out.push({ title: `Card processing fees · ${s.name}`, perYear: cardYear ? cardYear * 0.003 : null, tab: 'expenses',
      action: 'Renegotiate',
      detail: `About ${usd(feesYear)} a year${rate ? `, roughly ${rate.toFixed(2)}% of card sales` : ''}. Getting quotes from 2–3 other processors and asking for interchange-plus pricing typically takes 0.2–0.4 points off; 0.3 points ≈ ${cardYear ? usd(cardYear * 0.003) : '—'} a year.` });
  }

  // Same service, one store paying more
  for (const sv of services(txns, stores)) {
    const over = sv.stores.filter((p) => p.overPct >= 20 && p.overLowest >= 20);
    if (!over.length) continue;
    const cheapest = sv.stores.find((p) => p.perMonth === sv.lowest)!;
    out.push({ title: `${sv.category}: ${over.map((p) => p.name).join(', ')} pay${over.length === 1 ? 's' : ''} more`, tab: 'expenses',
      perYear: over.reduce((a, p) => a + p.overLowest * 12, 0), action: 'Renegotiate or switch',
      detail: `${cheapest.name} pays ${usd(cheapest.perMonth!)} a month (${cheapest.vendors.join(', ')}). ${over.map((p) => `${p.name} ${usd(p.perMonth!)} (${p.vendors.join(', ')})`).join('; ')}. Use the cheaper quote to renegotiate, or move to the same vendor.` });
  }

  const subs = fl.filter((f) => f.kind === 'subscription');
  if (subs.length) out.push({ title: `${subs.length} recurring card charges to review`, tab: 'chase', perYear: subs.reduce((a, f) => a + (f.yearly ?? 0), 0), action: 'Cancel what isn’t used',
    detail: `Biggest: ${subs.sort((a, b) => (b.yearly ?? 0) - (a.yearly ?? 0)).slice(0, 4).map((f) => `${f.title} ${usd(f.amount)}/mo`).join(', ')}. The figure is the total if all were cancelled.` });

  const alts = alt.map((a) => {
    const it = topItems(txns, stores).find((i) => i.key === a.item_key);
    return it ? { it, a, save: (it.avgPrice - a.unit_price) * it.yearlyQty } : null;
  }).filter((x): x is NonNullable<typeof x> => !!x && x.save > 0);
  if (alts.length) out.push({ title: 'Amazon items cheaper elsewhere', tab: 'amazon', perYear: alts.reduce((a, x) => a + x.save, 0), action: 'Switch supplier / buy in bulk',
    detail: alts.sort((a, b) => b.save - a.save).slice(0, 4).map((x) => `${x.it.title.slice(0, 40)}: ${usd(x.it.avgPrice)} on Amazon vs ${usd(x.a.unit_price)} at ${x.a.supplier}`).join('; ') });

  const sp = fl.filter((f) => f.kind === 'store_price');
  if (sp.length) out.push({ title: 'Same Amazon item, different price by store', tab: 'amazon', perYear: (() => { const am = range(txns.filter((t) => t.source === 'amazon')); return am.from ? yearly(sp.reduce((a, f) => a + f.amount, 0), am.from, am.to!) : null; })(), action: 'Order from one account / same listing',
    detail: sp.slice(0, 3).map((f) => `${f.title.slice(0, 40)}: ${f.detail}`).join('; ') });

  const often = fl.filter((f) => f.kind === 'too_often');
  if (often.length) out.push({ title: `${often.length} Amazon items bought often in small amounts`, tab: 'amazon', perYear: null, action: 'Buy in bulk',
    detail: `${often.slice(0, 4).map((f) => f.title.slice(0, 40)).join(', ')}. These go on the monthly price check; savings show here once a better price is entered.` });

  const dup = fl.filter((f) => f.kind === 'duplicate');
  if (dup.length) out.push({ title: `${dup.length} possible duplicate charges`, tab: dup.some((f) => f.source === 'amazon') ? 'amazon' : 'chase', perYear: null, action: 'Check and ask for refunds',
    detail: `${usd(dup.reduce((a, f) => a + f.amount, 0))} in total (one-time). Biggest: ${dup.sort((a, b) => b.amount - a.amount).slice(0, 3).map((f) => `${f.title.slice(0, 30)} ${usd(f.amount)}`).join(', ')}.` });

  const per = fl.filter((f) => f.kind === 'personal');
  if (per.length) out.push({ title: `${per.length} personal-looking or unclear charges`, tab: 'chase', perYear: null, action: 'Get receipts or move to personal',
    detail: `${usd(per.reduce((a, f) => a + f.amount, 0))} in total, e.g. ${per.sort((a, b) => b.amount - a.amount).slice(0, 3).map((f) => `${f.title.slice(0, 30)} ${usd(f.amount)}`).join(', ')}.` });

  return out.sort((a, b) => (b.perYear ?? -1) - (a.perYear ?? -1));
}
