import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { AdminNav } from '@/components/AdminNav';
import { byCategory, flags as findFlags, opportunities, range, services, topItems, usd, type AT, type Flag } from '@/lib/audit/analyze';
import { categorize, NOT_EXPENSES, type Rule } from '@/lib/audit/categorize';
import { currentTerm } from '@/lib/contracts';
import { todayNY } from '@/lib/dates';
import { RuleForm, UploadBox } from './Forms';
import { deleteAuditFile, deleteRule, dismissFlag, saveAltPrice } from './actions';

export const dynamic = 'force-dynamic';

const TABS = [['summary', 'Summary'], ['amazon', 'Amazon'], ['chase', 'Chase cards'], ['expenses', 'Store expenses'], ['categories', 'Categories & files']] as const;
type Tab = (typeof TABS)[number][0];
const pc = (n: number) => `${n.toFixed(n < 10 ? 1 : 0)}%`;
const nice = (iso: string | null) => (iso ? new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' }) : '—');
const FLAG_LABEL: Record<Flag['kind'], string> = {
  duplicate: 'Possible duplicate', subscription: 'Recurring', personal: 'Personal / unclear', too_often: 'Bought often, small amounts', price_up: 'Price went up', store_price: 'Store pays more', spike: 'Unusual month', big: 'Large one-time',
};

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const me = await requireRole('admin');
  const sp = await searchParams;
  const tab: Tab = (TABS.find(([k]) => k === sp.tab)?.[0] ?? 'summary') as Tab;
  const supabase = await supabaseServer();

  const [{ data: storesRaw }, { data: files }, { data: rules }, { data: alt }, { data: dismissedRows }, { data: contracts }] = await Promise.all([
    supabase.from('stores').select('id, name').order('name'),
    supabase.from('audit_files').select('*').order('uploaded_at', { ascending: false }),
    supabase.from('audit_rules').select('id, pattern, category').order('created_at'),
    supabase.from('audit_alt_prices').select('item_key, supplier, unit_price, note'),
    supabase.from('audit_dismissed').select('key'),
    supabase.from('contracts').select('id, vendor, category, business_id, end_date, notice_days, auto_renews, renewal_months, status'),
  ]);
  const stores = storesRaw ?? [];
  const txns: AT[] = [];
  for (let page = 0; ; page++) {
    const { data } = await supabase.from('audit_txns').select('id, source, business_id, txn_date, vendor, item, item_key, qty, unit_price, amount, category, ref').order('id').range(page * 1000, page * 1000 + 999);
    txns.push(...(data ?? []).map((t) => ({ ...t, amount: Number(t.amount), qty: t.qty == null ? null : Number(t.qty), unit_price: t.unit_price == null ? null : Number(t.unit_price) }) as AT));
    if (!data || data.length < 1000) break;
  }
  // Rows that came in from the bookkeeper's daily QuickBooks upload aren't sorted yet: sort and save them now
  const unsorted = txns.filter((t) => !t.category);
  if (unsorted.length) {
    const { data: biz } = await supabase.from('businesses').select('name');
    const internal = (biz ?? []).map((b) => b.name).filter((n) => n.length > 5);
    const groups = new Map<string, number[]>();
    for (const t of unsorted) { t.category = categorize(t.source, t.vendor, t.item, (rules ?? []) as Rule[], internal); groups.set(t.category, [...(groups.get(t.category) ?? []), t.id]); }
    for (const [category, ids] of groups) for (let i = 0; i < ids.length; i += 300) await supabase.from('audit_txns').update({ category }).in('id', ids.slice(i, i + 300));
  }
  const dismissed = new Set((dismissedRows ?? []).map((d) => d.key));
  const allFlags = findFlags(txns, stores);
  const openFlags = allFlags.filter((f) => !dismissed.has(f.key));
  const alts = (alt ?? []).map((a) => ({ ...a, unit_price: Number(a.unit_price) }));

  // Card sales from the POS reports, for the processing-fee rate
  const regRange = range(txns.filter((t) => t.source === 'register'));
  const cardSales: { business_id: string; amount: number; from: string; to: string }[] = [];
  if (regRange.from) for (const s of stores) {
    const { data } = await supabase.from('pos_daily').select('business_date, card_sales').eq('business_id', s.id).gte('business_date', regRange.from).order('business_date').limit(1000);
    if (data?.length) cardSales.push({ business_id: s.id, amount: data.reduce((a, r) => a + Number(r.card_sales ?? 0), 0), from: data[0].business_date, to: data[data.length - 1].business_date });
  }
  const opps = opportunities(txns, stores, openFlags, alts, cardSales);
  const name = (id: string | null) => stores.find((s) => s.id === id)?.name ?? 'Company card';
  const bySource = (src: AT['source']) => txns.filter((t) => t.source === src);
  const categories = [...new Set([...txns.map((t) => t.category), ...(rules ?? []).map((r) => r.category)])].sort();

  const FlagList = ({ list, empty }: { list: Flag[]; empty: string }) => (
    list.length === 0 ? <p className="muted small">{empty}</p> : (
      <table style={{ minWidth: 640 }}>
        <tbody>
          {list.map((f) => (
            <tr key={f.key}>
              <td style={{ width: 150 }}><span className={`pill ${f.kind === 'duplicate' || f.kind === 'personal' ? 'bad' : 'warn'}`}>{FLAG_LABEL[f.kind]}</span></td>
              <td><strong>{f.title.slice(0, 80)}</strong><div className="small muted">{f.detail}</div></td>
              <td className="r" style={{ whiteSpace: 'nowrap' }}>
                <form action={dismissFlag}><input type="hidden" name="key" value={f.key} /><button className="link small" type="submit">Looks fine, hide</button></form>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    )
  );

  const CategoryTable = ({ list, hideNonSpend }: { list: AT[]; hideNonSpend?: boolean }) => {
    const bc = byCategory(hideNonSpend ? list.filter((t) => !NOT_EXPENSES.includes(t.category)) : list, stores);
    if (!bc.rows.length) return <p className="muted small">Nothing loaded yet.</p>;
    return (
      <table className="num" style={{ minWidth: 300 + bc.cols.length * 150 }}>
        <thead><tr><th>Category</th><th className="r">All stores</th>{bc.cols.map((c) => <th key={c.id} className="r">{c.name}</th>)}</tr></thead>
        <tbody>
          {bc.rows.map((r) => (
            <tr key={r.category}>
              <td>{r.category}</td>
              <td className="r"><strong>{usd(r.all)}</strong><div className="small muted">{pc(r.pct)}</div></td>
              {r.byStore.map((b) => <td key={b.id} className="r">{b.amount ? <>{usd(b.amount)}<div className="small muted">{pc(b.pct)}</div></> : '—'}</td>)}
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td><strong>Total</strong></td><td className="r"><strong>{usd(bc.grand)}</strong></td>{bc.totals.map((t, i) => <td key={i} className="r"><strong>{usd(t)}</strong></td>)}</tr></tfoot>
      </table>
    );
  };

  const coverage = (src: AT['source']) => {
    const fs = (files ?? []).filter((f) => f.source === src);
    return (
      <div className="small muted">
        Loaded: {fs.length === 0 ? 'nothing yet' : stores.map((s) => { const mine = fs.filter((f) => f.business_id === s.id); return mine.length ? `${s.name} (${nice(mine.map((f) => f.date_from).sort()[0])} – ${nice(mine.map((f) => f.date_to).sort().slice(-1)[0])})` : null; }).filter(Boolean).join(' · ') || '—'}
        {src === 'chase' && fs.some((f) => !f.business_id) ? ` · company cards: ${fs.filter((f) => !f.business_id).map((f) => f.label ?? f.filename).join(', ')}` : ''}
      </div>
    );
  };

  return (
    <>
      <TopBar subtitle="Management Portal" who={`${me.email} · Admin`} />
      <AdminNav active="/audit" />
      <main className="page" style={{ maxWidth: 1400 }}>
        <div>
          <h1>Expense audit</h1>
          <span className="small muted">Amazon, Chase cards and the bank register for every store, sorted into categories and checked for savings. Only Ujash and Vrajesh can see this.</span>
        </div>
        <nav className="row" style={{ gap: 6, borderBottom: '1px solid var(--line)', paddingBottom: 8 }}>
          {TABS.map(([k, l]) => <a key={k} href={`/audit?tab=${k}`} className={`btn ${tab === k ? '' : 'secondary'}`} style={{ textDecoration: 'none', minHeight: 36, padding: '6px 14px' }}>{l}</a>)}
        </nav>

        {tab === 'summary' && (
          <>
            {txns.length === 0 && <div className="notice warn">Nothing loaded yet. Upload Amazon orders, Chase card activity and each store’s bank register on their tabs.</div>}
            {opps.length > 0 && (
              <section className="card" style={{ borderLeft: '4px solid var(--gold)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div className="row between"><h2>Biggest savings opportunities</h2>
                  <span className="small">Rough total: <strong>{usd(opps.reduce((a, o) => a + (o.perYear ?? 0), 0))} a year</strong></span></div>
                {opps.map((o, i) => (
                  <div key={i} style={{ padding: '10px 0', borderTop: i ? '1px solid var(--line-soft)' : undefined, display: 'grid', gridTemplateColumns: 'minmax(0,1fr) auto', gap: 12 }}>
                    <div><strong>{o.title}</strong> <span className="pill" style={{ background: '#f4f0e4' }}>{o.action}</span>
                      <div className="small muted" style={{ marginTop: 4 }}>{o.detail} <a href={`/audit?tab=${o.tab}`}>Details →</a></div></div>
                    <div className="r num"><strong>{o.perYear != null ? `${usd(o.perYear)}/yr` : '—'}</strong>{o.perYear != null && <div className="small muted">{usd(o.perYear / 12)}/mo</div>}</div>
                  </div>
                ))}
                <span className="small muted">Yearly figures are estimates from the period loaded, scaled to a year. “—” means it needs a check (a price elsewhere, a receipt) before a number can be put on it.</span>
              </section>
            )}
            <section className="card scroll">
              <h2 style={{ marginBottom: 8 }}>What’s loaded</h2>
              <table style={{ minWidth: 640 }}>
                <thead><tr><th>Store</th><th>Amazon</th><th>Chase cards</th><th>Bank register</th></tr></thead>
                <tbody>
                  {[...stores, { id: '', name: 'Company / several stores' }].map((s) => (
                    <tr key={s.id || 'co'}>
                      <td><strong>{s.name}</strong></td>
                      {(['amazon', 'chase', 'register'] as const).map((src) => {
                        const fs = (files ?? []).filter((f) => f.source === src && (f.business_id ?? '') === s.id);
                        return <td key={src} className="small">{fs.length ? `${nice(fs.map((f) => f.date_from).sort()[0])} – ${nice(fs.map((f) => f.date_to).sort().slice(-1)[0])}` : <span className="muted">{s.id || src === 'chase' ? 'not loaded' : '—'}</span>}</td>;
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </>
        )}

        {tab === 'amazon' && (() => {
          const am = bySource('amazon');
          const items = topItems(am, stores);
          const byCount = [...items].sort((a, b) => b.orders - a.orders || b.spend - a.spend).slice(0, 15);
          const top25 = items.slice(0, 25);
          const altFor = (k: string) => alts.find((a) => a.item_key === k);
          return (
            <>
              <UploadBox source="amazon" stores={stores} />
              {coverage('amazon')}
              <section className="card scroll"><h2 style={{ marginBottom: 8 }}>Amazon spend by category</h2><CategoryTable list={am} /></section>
              <section className="card scroll">
                <h2 style={{ marginBottom: 4 }}>Top items by spend</h2>
                <span className="small muted">Enter a price found elsewhere (Costco, Restaurant Depot, Uline, WebstaurantStore… that ships to the store) and the yearly saving shows up in the summary.</span>
                <table className="num" style={{ minWidth: 1100, marginTop: 8 }}>
                  <thead><tr><th>Item</th><th>Category</th><th className="r">Orders</th><th className="r">Qty</th><th className="r">Spent</th><th className="r">Per year</th><th className="r">Avg price</th><th className="r">Price range</th><th>Cheaper elsewhere (per unit)</th></tr></thead>
                  <tbody>
                    {items.slice(0, 40).map((it) => {
                      const a = altFor(it.key);
                      return (
                        <tr key={it.key}>
                          <td style={{ maxWidth: 360 }}><strong className="small">{it.title.slice(0, 90)}</strong><div className="small muted">{it.perStore.map((p) => `${p.name.split(' ')[0]} ${usd(p.spend)}`).join(' · ')}{it.everyDays ? ` · every ~${it.everyDays} days` : ''}</div></td>
                          <td className="small">{it.category}</td><td className="r">{it.orders}</td><td className="r">{Math.round(it.qty)}</td>
                          <td className="r">{usd(it.spend)}</td><td className="r">{usd(it.yearlySpend)}</td><td className="r">{usd(it.avgPrice)}</td>
                          <td className="r small" style={{ color: it.creep >= 10 ? 'var(--bad)' : undefined }}>{usd(it.minPrice)}–{usd(it.maxPrice)}</td>
                          <td>
                            <form action={saveAltPrice} className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
                              <input type="hidden" name="item_key" value={it.key} />
                              <input name="supplier" defaultValue={a?.supplier ?? ''} placeholder="Where" aria-label="Supplier" style={{ width: 110, minHeight: 34 }} />
                              <input name="unit_price" defaultValue={a?.unit_price ?? ''} placeholder="$" aria-label="Price per unit" inputMode="decimal" style={{ width: 70, minHeight: 34 }} />
                              <button className="btn secondary" type="submit" style={{ minHeight: 34, padding: '4px 10px' }}>Save</button>
                            </form>
                            {a && a.unit_price < it.avgPrice && <div className="small" style={{ color: 'var(--green)' }}>Saves ~{usd((it.avgPrice - a.unit_price) * it.yearlyQty)}/yr</div>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </section>
              <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
                <section className="card scroll" style={{ flex: '1 1 420px' }}>
                  <h2 style={{ marginBottom: 8 }}>Bought most often</h2>
                  <table className="num"><tbody>{byCount.map((it) => <tr key={it.key}><td className="small">{it.title.slice(0, 70)}</td><td className="r">{it.orders}×</td><td className="r small muted">{it.avgQty.toFixed(1)} each time</td><td className="r">{usd(it.spend)}</td></tr>)}</tbody></table>
                </section>
                <section className="card" style={{ flex: '1 1 420px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <h2>Monthly price check</h2>
                  <span className="small muted">Copy this and paste it to Claude in chat once a month to compare prices at Costco, Restaurant Depot, Uline and WebstaurantStore (with shipping to the store). Then enter the better prices in the table above.</span>
                  <textarea readOnly rows={12} style={{ fontFamily: 'monospace', fontSize: 12 }} value={`Price check: top ${top25.length} Amazon items (OneSpeed stores, ${nice(range(am).from)} – ${nice(range(am).to)})\n` + top25.map((it, i) => `${i + 1}. ${it.title.slice(0, 110)} | avg ${usd(it.avgPrice)} each | ~${Math.round(it.yearlyQty)} a year | ${usd(it.yearlySpend)}/yr`).join('\n')} />
                </section>
              </div>
              <section className="card scroll">
                <h2 style={{ marginBottom: 8 }}>Flags</h2>
                <FlagList list={openFlags.filter((f) => f.source === 'amazon')} empty="Nothing flagged." />
              </section>
            </>
          );
        })()}

        {tab === 'chase' && (() => {
          const ch = bySource('chase');
          return (
            <>
              <UploadBox source="chase" stores={stores} />
              {coverage('chase')}
              <section className="card scroll"><h2 style={{ marginBottom: 8 }}>Card spend by category</h2><CategoryTable list={ch} /></section>
              <section className="card scroll"><h2 style={{ marginBottom: 8 }}>Recurring charges (subscriptions)</h2><FlagList list={openFlags.filter((f) => f.kind === 'subscription')} empty="No recurring charges found yet." /></section>
              <section className="card scroll"><h2 style={{ marginBottom: 8 }}>Personal-looking or unclear</h2><FlagList list={openFlags.filter((f) => f.kind === 'personal' && f.source === 'chase')} empty="Nothing flagged." /></section>
              <section className="card scroll"><h2 style={{ marginBottom: 8 }}>Large one-time charges, duplicates &amp; unusual months</h2><FlagList list={openFlags.filter((f) => (f.kind === 'duplicate' || f.kind === 'spike' || f.kind === 'big') && f.source === 'chase')} empty="Nothing flagged." /></section>
            </>
          );
        })()}

        {tab === 'expenses' && (() => {
          const reg = bySource('register');
          const svc = services(txns, stores);
          const today = todayNY();
          const contractFor = (vendors: string[], businessId: string) => (contracts ?? []).find((c) => c.status === 'active' && (c.business_id === businessId || !c.business_id)
            && vendors.some((v) => v && (v.toLowerCase().includes(c.vendor.toLowerCase()) || c.vendor.toLowerCase().includes(v.toLowerCase().split(' ')[0]))));
          return (
            <>
              <div className="notice good">The bookkeeper’s daily QuickBooks register upload (Owners Report) feeds this automatically. Upload here only to add older months the daily file doesn’t cover.</div>
              <UploadBox source="register" stores={stores} />
              {coverage('register')}
              <section className="card scroll">
                <h2 style={{ marginBottom: 4 }}>Same service, store by store (per month)</h2>
                <span className="small muted">From the bank register and Chase cards. Red = 20%+ more than the cheapest store. The contract column checks the Contracts page; add any that are missing so you get renewal reminders.</span>
                {svc.length === 0 ? <p className="muted small">Upload the stores’ bank registers to compare.</p> : (
                  <table className="num" style={{ minWidth: 900, marginTop: 8 }}>
                    <thead><tr><th>Service</th><th>Store</th><th>Vendor</th><th className="r">Per month</th><th className="r">vs cheapest</th><th>Contract</th></tr></thead>
                    <tbody>
                      {svc.flatMap((s) => s.stores.map((p, i) => {
                        const c = contractFor(p.vendors, p.id);
                        const t = c ? currentTerm({ ...c, notice_days: c.notice_days ?? 30 }, today) : null;
                        return (
                          <tr key={`${s.category}-${p.id}`} style={i === 0 ? { borderTop: '2px solid var(--line)' } : undefined}>
                            <td>{i === 0 ? <strong>{s.category}</strong> : ''}</td><td>{p.name}</td><td className="small">{p.vendors.join(', ')}</td>
                            <td className="r"><strong>{usd(p.perMonth!)}</strong></td>
                            <td className="r" style={{ color: p.overPct >= 20 ? 'var(--bad)' : 'var(--muted)' }}>{p.overLowest > 0.5 ? `+${usd(p.overLowest)} (${pc(p.overPct)})` : 'cheapest'}</td>
                            <td className="small">{c && t ? <a href={`/contracts/${c.id}`}>Ends {nice(t.end)} · notice by {nice(t.notice)}</a>
                              : <a href={`/contracts?add=1&vendor=${encodeURIComponent(p.vendors[0] ?? '')}&category=${encodeURIComponent(s.category)}&store=${p.id}#add`}>No contract on file · add</a>}</td>
                          </tr>
                        );
                      }))}
                    </tbody>
                  </table>
                )}
              </section>
              <section className="card scroll"><h2 style={{ marginBottom: 4 }}>Bank register spend by category</h2>
                <span className="small muted">Inventory, payroll, rent, loans, taxes and owner transfers are left out so the controllable spending stands out.</span>
                <div style={{ marginTop: 8 }}><CategoryTable list={reg} hideNonSpend /></div></section>
              <section className="card scroll"><h2 style={{ marginBottom: 8 }}>Flags</h2><FlagList list={openFlags.filter((f) => f.source === 'register')} empty="Nothing flagged." /></section>
            </>
          );
        })()}

        {tab === 'categories' && (
          <>
            <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <h2>Your category rules</h2>
              <span className="small muted">Fix anything sorted wrong: a rule applies to every store and every file, now and in the future. Rules are checked before the built-in sorting.</span>
              <RuleForm categories={categories} />
              {(rules ?? []).length > 0 && (
                <table><tbody>{(rules ?? []).map((r) => (
                  <tr key={r.id}><td>“{r.pattern}”</td><td>→ {r.category}</td><td className="r"><form action={deleteRule}><input type="hidden" name="id" value={r.id} /><button className="link small" type="submit">Remove</button></form></td></tr>
                ))}</tbody></table>
              )}
            </section>
            <section className="card scroll">
              <h2 style={{ marginBottom: 4 }}>Not sorted yet</h2>
              <span className="small muted">Biggest vendors still in “Other”. Add a rule above for each.</span>
              <table className="num" style={{ marginTop: 8 }}><tbody>
                {(() => {
                  const m = new Map<string, number>();
                  for (const t of txns.filter((x) => x.category === 'Other' || x.category === 'Other Amazon')) { const k = (t.source === 'amazon' ? t.item : t.vendor) ?? '—'; m.set(k, (m.get(k) ?? 0) + t.amount); }
                  return [...m].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([v, a]) => <tr key={v}><td className="small">{v.slice(0, 90)}</td><td className="r">{usd(a)}</td></tr>);
                })()}
              </tbody></table>
            </section>
            <section className="card scroll">
              <h2 style={{ marginBottom: 8 }}>Files</h2>
              <table style={{ minWidth: 700 }}><tbody>
                {(files ?? []).map((f) => (
                  <tr key={f.id}>
                    <td className="small">{f.source === 'register' ? 'Bank register' : f.source === 'chase' ? `Chase ${f.label ?? ''}` : 'Amazon'}</td>
                    <td>{name(f.business_id)}</td><td className="small">{f.filename}</td><td className="small">{nice(f.date_from)} – {nice(f.date_to)} · {f.rows} lines</td>
                    <td className="r"><form action={deleteAuditFile}><input type="hidden" name="id" value={f.id} /><button className="link small" type="submit">Remove</button></form></td>
                  </tr>
                ))}
              </tbody></table>
              {dismissed.size > 0 && <p className="small muted" style={{ marginTop: 8 }}>{dismissed.size} flag{dismissed.size === 1 ? '' : 's'} marked “looks fine”.</p>}
            </section>
          </>
        )}
      </main>
    </>
  );
}
