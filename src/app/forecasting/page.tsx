import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { AdminNav } from '@/components/AdminNav';
import { addDays, todayNY } from '@/lib/dates';
import { analyze, seasonFactor, targetDaysFor, type DeptSale, type DeptRow, type InvLine } from '@/lib/forecast';
import { InventoryForms } from './InventoryForms';
import { deleteSnapshot, saveTargets } from './actions';

export const dynamic = 'force-dynamic';

const usd = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));
const pc = (n: number | null | undefined) => (n == null ? '—' : `${n.toFixed(1)}%`);
const d0 = (n: number | null | undefined) => (n == null ? '—' : Math.round(n).toLocaleString('en-US'));
const nice = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

const STATUS: Record<DeptRow['status'], [string, string]> = {
  dead: ['bad', 'No sales'], over: ['warn', 'Overstocked'], lean: ['bad', 'Running lean'], ok: ['good', 'Balanced'], not_counted: ['', 'Not in count'],
};

export default async function ForecastingPage({ searchParams }: { searchParams: Promise<{ store?: string; snap?: string; window?: string }> }) {
  const me = await requireRole('admin');
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const { data: stores } = await supabase.from('stores').select('id, name').eq('active', true).order('name');
  const store = stores?.find((s) => s.id === sp.store) ?? stores?.[0];
  const windowDays = [30, 60, 90, 180].includes(Number(sp.window)) ? Number(sp.window) : 90;
  const to = addDays(todayNY(), -1), from = addDays(to, -(windowDays - 1));

  const [{ data: snaps }, { data: tgt }] = await Promise.all([
    store ? supabase.from('inventory_snapshots').select('id, as_of, source, uploaded_by').eq('business_id', store.id).order('as_of', { ascending: false }) : Promise.resolve({ data: [] }),
    supabase.from('settings').select('value').eq('key', 'inventory_target_days').maybeSingle(),
  ]);
  const snap = snaps?.find((s) => s.id === sp.snap) ?? snaps?.[0] ?? null;
  const { data: lines } = snap ? await supabase.from('inventory_lines').select('department, qty, cost_value, retail_value').eq('snapshot_id', snap.id) : { data: null };

  const sales: DeptSale[] = [];
  if (store) for (let page = 0; ; page++) {
    const { data } = await supabase.from('pos_departments').select('department, business_date, sales, cost, profit, qty')
      .eq('business_id', store.id).gte('business_date', from).lte('business_date', to).order('business_date').range(page * 1000, page * 1000 + 999);
    sales.push(...(data ?? []).map((r) => ({ department: r.department, business_date: r.business_date, sales: Number(r.sales ?? 0), cost: Number(r.cost ?? 0), profit: Number(r.profit ?? 0), qty: Number(r.qty ?? 0) })));
    if (!data || data.length < 1000) break;
  }
  const { data: hist } = store ? await supabase.from('monthly_history').select('month, revenue').eq('business_id', store.id) : { data: [] };
  const season = seasonFactor((hist ?? []).map((h) => ({ month: h.month, revenue: Number(h.revenue) })), to);
  const saved = (tgt?.value ?? {}) as Record<string, number>;
  const inv: InvLine[] | null = lines ? lines.map((l) => ({ department: l.department, qty: l.qty == null ? null : Number(l.qty), cost_value: Number(l.cost_value), retail_value: l.retail_value == null ? null : Number(l.retail_value) })) : null;
  const a = analyze(sales, inv, { targetDays: (d) => targetDaysFor(d, saved), season });
  const departments = [...new Set(sales.map((s) => s.department))].sort();
  const maxMix = Math.max(1, ...a.rows.map((r) => Math.max(r.salesMix, r.invMix ?? 0)));
  const actions = a.rows.filter((r) => r.status === 'over' || r.status === 'dead' || r.status === 'lean')
    .sort((x, y) => Math.abs(y.change ?? 0) - Math.abs(x.change ?? 0)).slice(0, 6);
  const nextMonth = new Date(`${to.slice(0, 7)}-15T12:00:00Z`); nextMonth.setUTCMonth(nextMonth.getUTCMonth() + 1);

  return (
    <>
      <TopBar subtitle="Management Portal" who={`${me.email} · Admin`} />
      <AdminNav active="/forecasting" />
      <main className="page" style={{ maxWidth: 1360 }}>
        <div className="row between">
          <div>
            <h1>Forecasting</h1>
            <span className="small muted">Inventory you’re holding by department, against what each department actually sells.</span>
          </div>
          <form method="get" className="row">
            <select name="store" defaultValue={store?.id} aria-label="Store" style={{ width: 'auto' }}>
              {(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select name="window" defaultValue={String(windowDays)} aria-label="Sales period" style={{ width: 'auto' }}>
              {[30, 60, 90, 180].map((n) => <option key={n} value={n}>Last {n} days of sales</option>)}
            </select>
            <button className="btn secondary" type="submit">Show</button>
          </form>
        </div>

        {store && a.days === 0 && <div className="notice warn">No department sales for {store.name} in this period yet. They come from the nightly POS reports.</div>}
        {store && a.days > 0 && a.days < 60 && <div className="notice warn">Based on {a.days} days of department sales ({nice(a.from!)} – {nice(a.to!)}). Numbers firm up as more days come in; 60–90 days gives a reliable picture.</div>}

        {store && !snap && a.days > 0 && (
          <div className="notice">No inventory count for {store.name} yet. Upload one below to see days on hand and what to increase or cut. Until then, here’s each department’s share of sales.</div>
        )}

        {store && a.days > 0 && (
          <>
            <section className="grid num" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))' }}>
              {(snap ? [
                ['Inventory at cost', usd(a.totalInventory), `Counted ${nice(snap.as_of)}`],
                ['Days on hand', d0(a.daysOnHand), `${a.turns ? a.turns.toFixed(1) : '—'} turns a year`],
                ['Above target', usd(a.excess), 'Cash tied up in overstocked / unsold departments'],
                ['Below target', usd(a.short), 'Stock to add in departments running lean'],
                ['Next 30 days sales', usd(a.rows.reduce((t, r) => t + r.forecastSales30, 0)), season !== 1 ? `Includes a ${season > 1 ? '+' : ''}${((season - 1) * 100).toFixed(0)}% seasonal adjustment from last year` : 'At the current pace'],
              ] : [
                ['Sales in period', usd(a.totalSales), `${a.days} days with POS data`],
                ['Cost of goods sold / day', usd(a.totalCogsPerDay), 'What you need to replace each day'],
                ['Next 30 days sales', usd(a.rows.reduce((t, r) => t + r.forecastSales30, 0)), season !== 1 ? `Includes a ${season > 1 ? '+' : ''}${((season - 1) * 100).toFixed(0)}% seasonal adjustment` : 'At the current pace'],
              ]).map(([l, v, s]) => (
                <div key={l} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="small muted">{l}</span><strong style={{ fontSize: 22, color: 'var(--green)' }}>{v}</strong><span className="small muted">{s}</span>
                </div>
              ))}
            </section>

            {snap && actions.length > 0 && (
              <section className="card" style={{ borderLeft: '4px solid var(--gold)' }}>
                <h2 style={{ marginBottom: 8 }}>What the numbers suggest</h2>
                <ul style={{ margin: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {actions.map((r) => (
                    <li key={r.department} className="small">
                      <strong>{r.department}</strong>:{' '}
                      {r.status === 'dead' ? <>{usd(r.inventory)} on the shelf and no sales in {a.days} days. Consider marking down or returning it.</>
                        : r.status === 'over' ? <>about {d0(r.daysOnHand)} days of stock (target {r.targetDays}). It’s {pc(r.salesMix)} of sales but {pc(r.invMix)} of your inventory dollars. Holding roughly <strong>{usd(-(r.change ?? 0))}</strong> more than needed at cost; slow down buying until it sells through.</>
                        : <>only about {d0(r.daysOnHand)} days of stock (target {r.targetDays}). It’s {pc(r.salesMix)} of sales but {pc(r.invMix)} of inventory. Adding about <strong>{usd(r.change)}</strong> at cost would avoid running out{r.margin != null ? ` (margin ${pc(r.margin)})` : ''}.</>}
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="card">
              <h2 style={{ marginBottom: 4 }}>Share of sales{snap ? ' vs share of inventory' : ''}</h2>
              <span className="small muted">{snap ? 'A department whose inventory bar is much longer than its sales bar is tying up cash; the reverse risks running out.' : 'Each department’s share of sales in this period.'}</span>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12 }}>
                {a.rows.filter((r) => r.salesMix >= 0.5 || (r.invMix ?? 0) >= 0.5).map((r) => (
                  <div key={r.department} style={{ display: 'grid', gridTemplateColumns: 'minmax(110px, 160px) 1fr', gap: 10, alignItems: 'center' }}>
                    <span className="small"><strong>{r.department}</strong></span>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ height: 10, width: `${(r.salesMix / maxMix) * 100}%`, minWidth: 2, background: 'var(--green)', borderRadius: 3 }} /><span className="small num">{pc(r.salesMix)} of sales</span></div>
                      {snap && <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}><div style={{ height: 10, width: `${((r.invMix ?? 0) / maxMix) * 100}%`, minWidth: 2, background: 'var(--gold)', borderRadius: 3 }} /><span className="small num">{pc(r.invMix)} of inventory</span></div>}
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="card scroll">
              <h2 style={{ marginBottom: 8 }}>By department</h2>
              <table className="num" style={{ minWidth: snap ? 1180 : 760 }}>
                <thead><tr>
                  <th>Department</th><th className="r">Sales ({a.days}d)</th><th className="r">Mix</th><th className="r">Margin</th><th className="r">COGS / day</th>
                  {snap && <><th className="r">Inventory at cost</th><th className="r">Inv. mix</th><th className="r">Days on hand</th><th className="r">Target days</th><th className="r">Turns / yr</th><th className="r">GMROI</th><th className="r">Add / (cut)</th><th>Status</th></>}
                  <th className="r">Next 30 days</th>
                </tr></thead>
                <tbody>
                  {a.rows.map((r) => (
                    <tr key={r.department}>
                      <td><strong>{r.department}</strong></td><td className="r">{usd(r.sales)}</td><td className="r">{pc(r.salesMix)}</td><td className="r">{pc(r.margin)}</td><td className="r">{usd(r.cogsPerDay)}</td>
                      {snap && <>
                        <td className="r">{usd(r.inventory)}</td><td className="r">{pc(r.invMix)}</td><td className="r">{d0(r.daysOnHand)}</td><td className="r small">{r.targetDays}</td>
                        <td className="r">{r.turns ? r.turns.toFixed(1) : '—'}</td><td className="r">{r.gmroi ? `$${r.gmroi.toFixed(2)}` : '—'}</td>
                        <td className="r" style={{ color: (r.change ?? 0) < 0 ? 'var(--bad)' : undefined }}>{r.change ? (r.change > 0 ? `+${usd(r.change)}` : `(${usd(-r.change)})`) : '—'}</td>
                        <td><span className={`pill ${STATUS[r.status][0]}`}>{STATUS[r.status][1]}</span></td>
                      </>}
                      <td className="r">{usd(r.forecastSales30)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <p className="small muted" style={{ marginTop: 10 }}>
                Days on hand = inventory at cost ÷ cost of goods sold per day. Turns = how many times a year the stock sells through. GMROI = gross profit a year for every $1 of inventory (above ~$2–3 is healthy for liquor). Add / (cut) = what gets the department to its target days. Next 30 days = current pace{season !== 1 ? ` × ${season.toFixed(2)} for ${nextMonth.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' })}’s seasonality last year` : ''}.
              </p>
            </section>

            {snap && (
              <section className="card">
                <h2 style={{ marginBottom: 6 }}>Target days of stock</h2>
                <span className="small muted">How many days of sales each department should keep on hand. Starting points: beer &amp; mixers 14, liquor 45, wine 60, everything else 30. Applies to all stores.</span>
                <form action={saveTargets} className="row" style={{ marginTop: 10, alignItems: 'flex-end' }}>
                  {a.rows.filter((r) => r.status !== 'not_counted' || r.inventory).map((r) => (
                    <div key={r.department} className="field" style={{ flex: '0 1 130px' }}>
                      <label htmlFor={`t-${r.department}`} className="small">{r.department}</label>
                      <input id={`t-${r.department}`} name={`t_${r.department}`} type="number" min={1} max={365} defaultValue={r.targetDays} />
                    </div>
                  ))}
                  <button className="btn secondary" type="submit">Save targets</button>
                </form>
              </section>
            )}
          </>
        )}

        {store && <InventoryForms key={store.id} businessId={store.id} storeName={store.name} departments={departments} today={todayNY()} />}

        {store && (snaps ?? []).length > 0 && (
          <section className="card">
            <h2 style={{ marginBottom: 8 }}>Inventory counts for {store.name}</h2>
            <table>
              <tbody>
                {(snaps ?? []).map((s) => (
                  <tr key={s.id}>
                    <td>{s.id === snap?.id ? <strong>{nice(s.as_of)} (showing)</strong> : <a href={`/forecasting?store=${store.id}&snap=${s.id}&window=${windowDays}`}>{nice(s.as_of)}</a>}</td>
                    <td className="small muted">{s.source} · {s.uploaded_by}</td>
                    <td className="r"><form action={deleteSnapshot}><input type="hidden" name="id" value={s.id} /><button className="link small" type="submit">Remove</button></form></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>
    </>
  );
}
