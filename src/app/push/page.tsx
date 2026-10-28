import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { ManagerNav } from '@/components/ManagerNav';
import { CopyList, UnsoldUpload } from './Forms';
import { clearFocus, toggleFocus } from './actions';

export const dynamic = 'force-dynamic';

type Item = { sku: string; description: string; kind: string; stock: number; cost: number | null; price: number | null; focus: boolean };
const usd = (n: number | null | undefined, cents = true) => (n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents ? 2 : 0 }));
const nice = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—');
const KIND_ORDER = ['Liquor', 'Wine', 'Sparkling', 'Beer, seltzer & RTD', 'THC drinks', 'Mixers & other'];

export default async function PushPage({ searchParams }: { searchParams: Promise<{ store?: string; kind?: string; sort?: string; hidenew?: string }> }) {
  const me = await requireRole('admin', 'manager');
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const { data: stores } = await supabase.from('stores').select('id, name').eq('active', true).order('name');
  const store = stores?.find((s) => s.id === sp.store) ?? stores?.[0];
  const [{ data: list }, items] = store ? await Promise.all([
    supabase.from('unsold_lists').select('period_from, period_to, uploaded_at, uploaded_by').eq('business_id', store.id).maybeSingle(),
    (async () => {
      const out: Item[] = [];
      for (let page = 0; ; page++) {
        const { data } = await supabase.from('unsold_items').select('sku, description, kind, stock, cost, price, focus').eq('business_id', store.id).range(page * 1000, page * 1000 + 999);
        out.push(...(data ?? []).map((i) => ({ ...i, stock: Number(i.stock ?? 0), cost: i.cost == null ? null : Number(i.cost), price: i.price == null ? null : Number(i.price) })));
        if (!data || data.length < 1000) break;
      }
      return out;
    })(),
  ]) : [{ data: null }, [] as Item[]];
  const value = (i: Item) => i.stock * (i.cost ?? 0);
  const kinds = KIND_ORDER.filter((k) => items.some((i) => i.kind === k));
  const kind = kinds.includes(sp.kind ?? '') ? sp.kind! : null;
  const sort = sp.sort === 'units' ? 'units' : sp.sort === 'newest' ? 'newest' : 'value';
  // SKUs are numbered in the order items were added: the highest ones are most likely new arrivals, not dead stock
  const NEW_COUNT = 40;
  const newSkus = new Set([...items].filter((i) => /^\d+$/.test(i.sku)).sort((a, b) => Number(b.sku) - Number(a.sku)).slice(0, NEW_COUNT).map((i) => i.sku));
  const hideNew = sp.hidenew === '1';
  const total = items.reduce((a, i) => a + value(i), 0);
  const isAdmin = me.role === 'admin';
  const link = (extra: Record<string, string>) => `/push?${new URLSearchParams({ ...(store ? { store: store.id } : {}), ...extra })}`;

  const focus = items.filter((i) => i.focus).sort((a, b) => a.kind.localeCompare(b.kind) || value(b) - value(a));
  const FocusBtn = ({ i }: { i: Item }) => (
    <form action={toggleFocus} className="no-print" style={{ display: 'inline' }}>
      <input type="hidden" name="business_id" value={store!.id} /><input type="hidden" name="sku" value={i.sku} /><input type="hidden" name="on" value={i.focus ? '0' : '1'} />
      <button type="submit" className={`btn ${i.focus ? '' : 'secondary'}`} style={{ minHeight: 30, padding: '2px 10px', fontSize: 13 }} aria-label={i.focus ? `Remove ${i.description} from focus list` : `Add ${i.description} to focus list`}>{i.focus ? '✓ Focus' : '+ Focus'}</button>
    </form>
  );
  const Table = ({ rows }: { rows: Item[] }) => (
    <table className="num" style={{ width: '100%' }}>
      <thead><tr><th>Item</th><th className="r">On shelf</th><th className="r no-print">Price</th><th className="r no-print">Tied up (cost)</th><th className="no-print" /></tr></thead>
      <tbody>{rows.map((i) => (
        <tr key={i.sku} style={i.focus ? { background: '#f4f0e4' } : undefined}><td>{i.description}{newSkus.has(i.sku) && <span className="pill warn" style={{ marginLeft: 6 }} title="One of the most recently added SKUs: probably new, not dead stock">Likely new</span>}<span className="small muted"> · SKU {i.sku}</span></td><td className="r">{i.stock}</td><td className="r no-print">{usd(i.price)}</td><td className="r no-print">{usd(value(i), false)}</td><td className="r no-print"><FocusBtn i={i} /></td></tr>
      ))}</tbody>
    </table>
  );
  const focusText = `${store?.name ?? ''}: items to push this week\n` + focus.map((i, n) => `${n + 1}. ${i.description}`).join('\n');

  return (
    <>
      <TopBar subtitle={isAdmin ? 'Management Portal' : 'Store Portal'} who={`${me.email} · ${isAdmin ? 'Admin' : 'Manager'}`} printLogo={false} />
      <ManagerNav active="/push" admin={isAdmin} />
      <main className="page" style={{ maxWidth: 1200 }}>
        <div className="row between">
          <div>
            <h1>Items to push{store ? ` · ${store.name}` : ''}</h1>
            <span className="small muted">{list ? `Items with no sales ${nice(list.period_from)} – ${nice(list.period_to)} · uploaded ${new Date(list.uploaded_at).toLocaleDateString('en-US', { timeZone: 'America/New_York' })}` : 'Upload the POS Unsold Item List Report to see what to push.'}</span>
          </div>
          <div className="row no-print">
            {(stores?.length ?? 0) > 1 && (
              <form method="get" className="row">
                <select name="store" defaultValue={store?.id} aria-label="Store" style={{ width: 'auto' }}>{(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                <button className="btn secondary" type="submit">Show</button>
              </form>
            )}
          </div>
        </div>

        {items.length > 0 && (
          <>
            {/* 1. Pick a department */}
            <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2>{kind ? 'Department' : 'Pick a department'}</h2>
              <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 10 }}>
                {kinds.map((k) => {
                  const rows = items.filter((i) => i.kind === k);
                  const on = kind === k;
                  return (
                    <a key={k} href={link(on ? {} : { kind: k })} className="no-print" style={{ textDecoration: 'none', color: 'inherit', padding: 12, borderRadius: 10,
                      border: `2px solid ${on ? 'var(--green)' : 'var(--line)'}`, background: on ? '#eef4ee' : '#fff' }}>
                      <strong style={{ fontSize: 16 }}>{k}</strong>
                      <div className="small muted num">{rows.length} items · {usd(rows.reduce((a, i) => a + value(i), 0), false)}</div>
                      {rows.some((i) => newSkus.has(i.sku)) && <div className="small muted">{rows.filter((i) => newSkus.has(i.sku)).length} likely new</div>}
                      {rows.some((i) => i.focus) && <div className="small" style={{ color: 'var(--green)' }}>✓ {rows.filter((i) => i.focus).length} in focus list</div>}
                    </a>
                  );
                })}
              </div>
              {!kind && <span className="small muted no-print">{items.length} items with no sales · {usd(total, false)} tied up at cost. Pick a department to see its items and choose a few for staff to push.</span>}
            </section>

            {/* 2. The chosen department */}
            {kind && (() => {
              const rows = items.filter((i) => i.kind === kind && !(hideNew && newSkus.has(i.sku)))
                .sort((a, b) => (sort === 'units' ? b.stock - a.stock : sort === 'newest' ? Number(b.sku) - Number(a.sku) : value(b) - value(a)));
              return (
                <section className="card">
                  <div className="row between">
                    <h2>{kind} <span className="small muted">· {rows.length} items</span></h2>
                    <div className="row no-print" style={{ gap: 4 }}>
                      <span className="small muted">Sort by</span>
                      <a href={link({ kind })} className={`btn ${sort !== 'units' ? '' : 'secondary'}`} style={{ textDecoration: 'none', minHeight: 30, padding: '2px 10px' }}>Most money tied up</a>
                      <a href={link({ kind, sort: 'units' })} className={`btn ${sort === 'units' ? '' : 'secondary'}`} style={{ textDecoration: 'none', minHeight: 30, padding: '2px 10px' }}>Most on the shelf</a>
                      <a href={link({ kind, sort: 'newest' })} className={`btn ${sort === 'newest' ? '' : 'secondary'}`} style={{ textDecoration: 'none', minHeight: 30, padding: '2px 10px' }}>Newest first (highest SKU)</a>
                      <a href={link({ kind, ...(sort !== 'value' ? { sort } : {}), ...(hideNew ? {} : { hidenew: '1' }) })} className="small" style={{ marginLeft: 6 }}>{hideNew ? 'Show likely new items' : 'Hide likely new items'}</a>
                    </div>
                  </div>
                  <span className="small muted">Press <strong>+ Focus</strong> on the items staff should push (10–15 in total works well). <span className="pill warn">Likely new</span> marks the {NEW_COUNT} most recently added SKUs: probably new arrivals that haven’t had time to sell, not dead stock.</span>
                  <div style={{ marginTop: 8 }}><Table rows={rows} /></div>
                </section>
              );
            })()}

            {/* 3. The focus list (short) */}
            <section className="card" style={{ borderLeft: '4px solid var(--green)', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="row between">
                <h2>Focus list for staff <span className="small muted">· {focus.length} item{focus.length === 1 ? '' : 's'}</span></h2>
                {focus.length > 0 && (
                  <div className="row no-print">
                    <a className="btn" href={`/push/focus?store=${store!.id}`} target="_blank" rel="noopener" style={{ textDecoration: 'none' }}>Print focus list</a>
                    <CopyList text={focusText} />
                    <a className="btn secondary" href={`mailto:?subject=${encodeURIComponent(`Items to push · ${store!.name}`)}&body=${encodeURIComponent(focusText)}`} style={{ textDecoration: 'none' }}>Email</a>
                    <form action={clearFocus}><input type="hidden" name="business_id" value={store!.id} /><button className="link small" type="submit">Clear list</button></form>
                  </div>
                )}
              </div>
              {focus.length > 0 && <span className="small muted no-print">The printed, copied and emailed list shows item names only, with no price or cost, so it’s safe to leave where customers might see it.</span>}
              {focus.length === 0 ? <span className="small muted">Nothing picked yet. Items you mark with + Focus show up here, ready to print or send. The list stays when a new report is uploaded, and items that sell drop off.</span> : (
                <details>
                  <summary className="small" style={{ cursor: 'pointer' }}>Show the {focus.length} items</summary>
                  <table className="num" style={{ width: '100%', marginTop: 6 }}><tbody>{focus.map((i) => (
                    <tr key={i.sku}><td><strong>{i.description}</strong><span className="small muted"> · {i.kind}</span></td><td className="r no-print">{usd(i.price)}</td><td className="r small muted">{i.stock} on shelf</td><td className="r no-print"><FocusBtn i={i} /></td></tr>
                  ))}</tbody></table>
                </details>
              )}
            </section>
          </>
        )}
        {store && <UnsoldUpload businessId={store.id} storeName={store.name} />}
        <p className="small muted no-print">Later, staff will be able to sign in and see this list for their store.</p>
      </main>
    </>
  );
}
