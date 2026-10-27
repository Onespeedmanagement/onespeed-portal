import * as XLSX from 'xlsx';

// POS "Unsold Item List Report" (.xls): store name + date range at the top, then
// Sr # | SKU | Description | Stock | Current Cost | Price. Long descriptions wrap onto
// the next row (no Sr #), so those are joined back on.
export type UnsoldItem = { sku: string; description: string; kind: string; stock: number; cost: number | null; price: number | null };
export type UnsoldList = { storeName: string; from: string | null; to: string | null; items: UnsoldItem[] };

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  const s = String(v ?? '').replace(/[$,\s]/g, '');
  return s && Number.isFinite(Number(s)) ? Number(s) : null;
};
const MON: Record<string, string> = { jan: '01', feb: '02', mar: '03', apr: '04', may: '05', jun: '06', jul: '07', aug: '08', sep: '09', oct: '10', nov: '11', dec: '12' };
const day = (s: string) => { const m = s.match(/(\d{1,2})-([A-Za-z]{3})-(\d{4})/); return m ? `${m[3]}-${MON[m[2].toLowerCase()]}-${m[1].padStart(2, '0')}` : null; };

// What kind of product, from the description (the report has no department column)
export function kindOf(d: string): string {
  const t = d.toUpperCase();
  if (/\bTHC\b|\d+\s?MG\b|HEMP|DELTA/.test(t)) return 'THC drinks';
  if (/SELTZER|\bBEER\b|\bIPA\b|LAGER|\bALE\b|STOUT|PORTER|CIDER|BREW|HARD TEA|TRULY|WHITE CLAW|\d+\s?OZ\b.*(PACK|CAN)|\b(6|12|15|18|24|30)\s?PACK\b|SUNTORY|HIGH NOON|KEG|DELIRIUM|GIFT SET.*(BEER|ALE)/.test(t)) return 'Beer, seltzer & RTD';
  if (/CHAMPAGNE|PROSECCO|CAVA|SPARKLING|BRUT|MOSCATO D'ASTI|ASTI\b/.test(t)) return 'Sparkling';
  if (/CYNAR|TRIPLE SEC|CURACAO|LIMONCELLO|APEROL|CAMPARI|AMARETTO|KAHLUA|BAILEYS|JAGER/.test(t)) return 'Liquor';
  if (/BITTERS|SYRUP|GARNISH|MARGARITA MIX|MARG MIX|BLOODY MARY|FEVER TREE|COCKTAIL MIX|OLIVES|CHERRIES|JUICE|NECTAR|SODA\b|TONIC|GINGER BEER|MINUTE MAID|ARIZONA|CORK|OPENER|GIFT BAG/.test(t)) return 'Mixers & other';
  if (/VODKA|WHISK|BOURBON|SCOTCH|\bRYE\b|TEQUILA|MEZCAL|\bRUM\b|\bGIN\b|COGNAC|BRANDY|VSOP|\bXO\b|\b2XO\b|LIQUEUR|CORDIAL|SCHNAPPS|ABSINTHE|ANSINTHE|AMARO|APERITIVO|VERMOUTH|\bYRS?\b|\bPROOF\b|SINGLE MALT|CREAM LIQ/.test(t)) return 'Liquor';
  if (/CAB\b|CABERNET|CHARD|MERLOT|PINOT|SAUV|RIESLING|MALBEC|ZINFANDEL|\bZIN\b|SYRAH|SHIRAZ|RED BLEND|\bRED\b|\bWHITE\b|ROSE\b|ROSÉ|SANGRIA|PORT\b|SHERRY|CHIANTI|RIOJA|BORDEAUX|BURGUNDY|MOSCATO|GRENACHE|TEMPRANILLO|WINE|\b750ML\b.*(BLEND)|CELLARS|VINEYARD|ESTATE|CRIMES|NAPA|SONOMA|CHENIN|BLANC\b|RHONE|COTES|MADEIRA|MADRIA|CHATEAU|CHÂTEAU|DOMAINE|PROPRIETARY|GRAN RESERVA|BAROLO|PROSECCO|SAKE/.test(t)) return /SAKE/.test(t) ? 'Mixers & other' : 'Wine';
  if (/750ML|1\.75L|1L\b|375ML|50ML|200ML|100ML/.test(t)) return 'Liquor';
  if (/1\.5L|3L\b|BOX\b/.test(t)) return 'Wine';
  return 'Mixers & other';
}

export function parseUnsold(bytes: Uint8Array): UnsoldList {
  const wb = XLSX.read(bytes, { type: 'array' });
  const g = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: '' }) as unknown[][];
  const text = (r: unknown[]) => r.map((c) => String(c ?? '').trim()).filter(Boolean);
  if (!g.slice(0, 8).some((r) => text(r).some((c) => /Unsold Item List/i.test(c)))) throw new Error('This isn’t the POS “Unsold Item List Report”.');
  const storeName = text(g[0] ?? [])[0] ?? '';
  const range = g.slice(0, 8).flatMap(text).find((c) => /From\s+\d/i.test(c)) ?? '';
  const [from, to] = [range.match(/From\s+(\S+)/i)?.[1], range.match(/To\s+(\S+)/i)?.[1]].map((s) => (s ? day(s) : null));

  const h = g.findIndex((r) => text(r).some((c) => /^SKU$/i.test(c)) && text(r).some((c) => /^Description$/i.test(c)));
  if (h < 0) throw new Error('Couldn’t find the SKU / Description columns.');
  const head = (g[h] as unknown[]).map((c) => String(c ?? '').trim().toLowerCase());
  const ix = { sr: head.findIndex((c) => /^sr/.test(c)), sku: head.indexOf('sku'), desc: head.indexOf('description'), stock: head.indexOf('stock'),
    cost: head.findIndex((c) => /cost/.test(c)), price: head.indexOf('price') };
  // Numbers often sit a column or two right of their header: take the first number at or after it
  const at = (r: unknown[], i: number, until: number) => { for (let j = i; j >= 0 && j < Math.max(until, i + 1); j++) { const v = num(r[j]); if (v != null) return v; } return null; };

  const items: UnsoldItem[] = [];
  for (const r of g.slice(h + 1)) {
    const sr = String(r[ix.sr] ?? '').trim();
    const desc = String(r[ix.desc] ?? '').trim();
    if (!sr && desc && items.length) { items[items.length - 1].description = `${items[items.length - 1].description} ${desc}`.replace(/\s+/g, ' ').trim(); continue; }
    const sku = String(r[ix.sku] ?? '').trim();
    if (!/^\d+$/.test(sr) || !sku) continue;
    items.push({ sku, description: desc.replace(/\s+/g, ' '), kind: '', stock: at(r, ix.stock, ix.cost) ?? 0,
      cost: at(r, ix.cost, ix.price), price: at(r, ix.price, (r as unknown[]).length) });
  }
  for (const it of items) it.kind = kindOf(it.description);
  // Distributor delivery charges, surcharges and deposits show up as "items": leave them out
  // 24-packs are case SKUs (the cans/bottles ring up as singles or smaller packs), so they never show sales: always left out
  const real = items.filter((it) => !/DELIVER|DEILVER|SURCH|FREIGHT|\bCHARGE|DEPOSIT|FUEL FEE/i.test(it.description) && !/\b24\s*-?\s*(PACK|PK)\b/i.test(it.description));
  items.length = 0; items.push(...real);
  if (!items.length) throw new Error('No items found in the report.');
  return { storeName, from, to, items };
}
