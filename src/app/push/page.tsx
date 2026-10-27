import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { ManagerNav } from '@/components/ManagerNav';
import { PrintButton, UnsoldUpload } from './Forms';

export const dynamic = 'force-dynamic';

type Item = { sku: string; description: string; kind: string; stock: number; cost: number | null; price: number | null };
const usd = (n: number | null | undefined, cents = true) => (n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: cents ? 2 : 0 }));
const nice = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—');
const KIND_ORDER = ['Liquor', 'Wine', 'Sparkling', 'Beer, seltzer & RTD', 'THC drinks', 'Mixers & other'];

export default async function PushPage({ searchParams }: { searchParams: Promise<{ store?: string; kind?: string }> }) {
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
        const { data } = await supabase.from('unsold_items').select('sku, description, kind, stock, cost, price').eq('business_id', store.id).range(page * 1000, page * 1000 + 999);
        out.push(...(data ?? []).map((i) => ({ ...i, stock: Number(i.stock ?? 0), cost: i.cost == null ? null : Number(i.cost), price: i.price == null ? null : Number(i.price) })));
        if (!data || data.length < 1000) break;
      }
      return out;
    })(),
  ]) : [{ data: null }, [] as Item[]];
  const value = (i: Item) => i.stock * (i.cost ?? 0);
  const kinds = KIND_ORDER.filter((k) => items.some((i) => i.kind === k));
  const kind = kinds.includes(sp.kind ?? '') ? sp.kind! : null;
  const shown = kind ? items.filter((i) => i.kind === kind) : items;
  const pushFirst = [...items].sort((a, b) => value(b) - value(a)).slice(0, 20);
  const mostUnits = [...items].filter((i) => i.stock >= 6).sort((a, b) => b.stock - a.stock).slice(0, 15);
  const total = items.reduce((a, i) => a + value(i), 0);
  const retail = items.reduce((a, i) => a + i.stock * (i.price ?? 0), 0);
  const isAdmin = me.role === 'admin';
  const link = (extra: Record<string, string>) => `/push?${new URLSearchParams({ ...(store ? { store: store.id } : {}), ...extra })}`;

  const Table = ({ rows }: { rows: Item[] }) => (
    <table className="num" style={{ width: '100%' }}>
      <thead><tr><th>Item</th><th className="r">On shelf</th><th className="r">Price</th><th className="r">Tied up (cost)</th></tr></thead>
      <tbody>{rows.map((i) => (
        <tr key={i.sku}><td>{i.description}<span className="small muted"> · SKU {i.sku}</span></td><td className="r">{i.stock}</td><td className="r">{usd(i.price)}</td><td className="r">{usd(value(i), false)}</td></tr>
      ))}</tbody>
    </table>
  );

  return (
    <>
      <TopBar subtitle={isAdmin ? 'Management Portal' : 'Store Portal'} who={`${me.email} · ${isAdmin ? 'Admin' : 'Manager'}`} />
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
            {items.length > 0 && <PrintButton />}
          </div>
        </div>

        {items.length > 0 && (
          <>
            <section className="grid num" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              {[['Items not selling', String(items.length)], ['Bottles / packs on the shelf', Math.round(items.reduce((a, i) => a + i.stock, 0)).toLocaleString('en-US')],
                ['Money tied up (cost)', usd(total, false)], ['Worth at shelf price', usd(retail, false)]].map(([l, v]) => (
                <div key={l} className="card"><span className="small muted">{l}</span><div style={{ fontSize: 24, fontWeight: 600, color: 'var(--green)' }}>{v}</div></div>
              ))}
            </section>

            <section className="card" style={{ borderLeft: '4px solid var(--gold)' }}>
              <h2 style={{ marginBottom: 4 }}>Push these first</h2>
              <span className="small muted">The 20 items with the most money sitting on the shelf. Recommend them to customers, give them a better spot, or ask about a markdown.</span>
              <div style={{ marginTop: 8 }}><Table rows={pushFirst} /></div>
            </section>

            {mostUnits.length > 0 && (
              <section className="card">
                <h2 style={{ marginBottom: 4 }}>Most bottles / packs on the shelf</h2>
                <span className="small muted">Lots of units and nothing sold: good candidates for a display or a bundle.</span>
                <div style={{ marginTop: 8 }}><Table rows={mostUnits} /></div>
              </section>
            )}

            <section className="card">
              <div className="row between">
                <h2>Everything not selling, by type</h2>
                <div className="row no-print" style={{ gap: 4 }}>
                  <a href={link({})} className={`btn ${!kind ? '' : 'secondary'}`} style={{ textDecoration: 'none', minHeight: 32, padding: '4px 10px' }}>All</a>
                  {kinds.map((k) => <a key={k} href={link({ kind: k })} className={`btn ${kind === k ? '' : 'secondary'}`} style={{ textDecoration: 'none', minHeight: 32, padding: '4px 10px' }}>{k}</a>)}
                </div>
              </div>
              <span className="small muted">Type is worked out from the item name, so a few may be in the wrong group.</span>
              {(kind ? [kind] : kinds).map((k) => {
                const rows = shown.filter((i) => i.kind === k).sort((a, b) => value(b) - value(a));
                return (
                  <div key={k} style={{ marginTop: 14 }}>
                    <h3 style={{ fontSize: 17, margin: '0 0 4px', color: 'var(--green)' }}>{k} <span className="small muted">· {rows.length} items · {usd(rows.reduce((a, i) => a + value(i), 0), false)} at cost</span></h3>
                    <Table rows={rows} />
                  </div>
                );
              })}
            </section>
          </>
        )}

        {store && <UnsoldUpload businessId={store.id} storeName={store.name} />}
        <p className="small muted no-print">Later, staff will be able to sign in and see this list for their store.</p>
      </main>
    </>
  );
}
