import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { AdminNav } from '@/components/AdminNav';
import { HolidayTag } from '@/components/HolidayTag';
import { SalesAndCash, LedgerTable } from '@/components/OwnersDay';
import { loadOwnersDay } from '@/lib/owners';
import { getTolerance } from '@/lib/closeouts';
import { addDays, shortDate, todayNY } from '@/lib/dates';
import { longDate, money, signedMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

const STATUS: Record<string, [string, string]> = { good: ['good', '✓ Good'], watch: ['warn', 'Watch'], low: ['bad', 'Low'] };

export default async function OwnersPage({ searchParams }: { searchParams: Promise<{ store?: string; date?: string }> }) {
  const me = await requireRole('admin', 'investor');
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const { data: stores } = await supabase.from('businesses').select('id, name').eq('active', true).order('name');
  const store = stores?.find((s) => s.id === sp.store) ?? stores?.[0];
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : addDays(todayNY(), -1);
  const tolerance = await getTolerance(supabase);
  const day = store ? await loadOwnersDay(supabase, store.id, date) : null;
  const ids = (stores ?? []).map((s) => s.id);

  const monthStart = date.slice(0, 8) + '01';
  const [{ data: allPos }, { data: allCo }, { data: allRep }, { data: allLines }, { data: checks }] = await Promise.all([
    supabase.from('pos_daily').select('business_id, total_sales').eq('business_date', date).in('business_id', ids),
    supabase.from('closeout_results').select('business_id, deposit_amount, difference').eq('business_date', date).in('business_id', ids),
    supabase.from('owners_report').select('business_id, qb_balance, balance_status').eq('business_date', date).in('business_id', ids),
    supabase.from('ledger_lines').select('business_id, debit').eq('business_date', date).in('business_id', ids),
    supabase.from('ledger_lines').select('business_id, business_date, check_number, check_date, debit, distributors(name)')
      .eq('line_type', 'distributor_check').gte('business_date', monthStart).lte('business_date', addDays(monthStart, 40)).in('business_id', ids).order('check_date'),
  ]);
  type Check = { business_id: string; business_date: string; check_number: string | null; check_date: string | null; debit: number; distributors: { name: string } | null };
  const cs = ((checks ?? []) as unknown as Check[]).filter((c) => c.business_date.slice(0, 7) === date.slice(0, 7));
  const byDist = new Map<string, number>();
  for (const c of cs) byDist.set(c.distributors?.name ?? '—', (byDist.get(c.distributors?.name ?? '—') ?? 0) + Number(c.debit));
  const name = (id: string) => stores?.find((s) => s.id === id)?.name ?? '';
  const isInvestor = me.role === 'investor';

  return (
    <>
      <TopBar subtitle={isInvestor ? 'Investor Portal' : 'Management Portal'} who={`${me.email} · ${isInvestor ? 'Investor' : 'Admin'}`} />
      {!isInvestor && <AdminNav active="/owners" />}
      <main className="page" style={{ maxWidth: 1360 }}>
        <div className="row between">
          <div>
            {isInvestor && <a href="/investments" className="small">← Your investments</a>}
            <div className="eyebrow">{isInvestor ? 'View only' : 'Owners only · bank figures entered by accounting@'}</div>
            <h1>Owners Report</h1>
          </div>
          <form className="row" method="get">
            <select name="store" defaultValue={store?.id} aria-label="Store" style={{ width: 'auto' }}>
              {(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <a className="btn secondary" style={{ textDecoration: 'none' }} href={`/owners?store=${store?.id ?? ''}&date=${addDays(date, -1)}`} aria-label="Previous day">‹</a>
            <input type="date" name="date" defaultValue={date} aria-label="Date of business" style={{ width: 'auto' }} />
            <a className="btn secondary" style={{ textDecoration: 'none' }} href={`/owners?store=${store?.id ?? ''}&date=${addDays(date, 1)}`} aria-label="Next day">›</a>
            <button className="btn secondary" type="submit">Open</button>
          </form>
        </div>

        {!store && <div className="notice warn">No businesses are shared with you yet.</div>}
        {store && day && (
          <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
            <section className="card" style={{ flex: '1 1 340px' }}>
              <div className="row between"><h2>{store.name}</h2><span className="small muted">{longDate(date)}<HolidayTag date={date} /></span></div>
              <SalesAndCash day={day} tolerance={tolerance} />
              {day.co?.note && <div className="notice warn" style={{ marginTop: 10 }}>Manager note: “{day.co.note}”</div>}
            </section>
            <section className="card" style={{ flex: '1.3 1 460px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div className="row between">
                <div><div className="small muted">WSFS · QuickBooks balance</div>
                  <div className="num" style={{ fontSize: 32, fontWeight: 600, color: 'var(--green)' }}>{day.rep ? money(day.rep.qb_balance) : 'Not entered yet'}</div></div>
                {day.rep && <span className={`pill ${STATUS[day.rep.balance_status][0]}`}>{STATUS[day.rep.balance_status][1]}</span>}
              </div>
              <LedgerTable day={day} />
              {day.rep && <span className="small muted">Entered by {day.rep.entered_by}</span>}
            </section>
          </div>
        )}

        {(stores?.length ?? 0) > 1 && (
          <section className="card scroll">
            <h2 style={{ marginBottom: 10 }}>All stores · {shortDate(date)}</h2>
            <table className="num" style={{ minWidth: 820 }}>
              <thead><tr><th>Store</th><th className="r">Sales</th><th className="r">Cash deposited</th><th className="r">Difference</th><th className="r">QB balance</th><th className="r">Paid out (debits)</th><th>Bookkeeper</th></tr></thead>
              <tbody>
                {(stores ?? []).map((s) => {
                  const p = allPos?.find((x) => x.business_id === s.id); const c = allCo?.find((x) => x.business_id === s.id);
                  const r = allRep?.find((x) => x.business_id === s.id);
                  const deb = (allLines ?? []).filter((l) => l.business_id === s.id).reduce((a, l) => a + Number(l.debit), 0);
                  return (
                    <tr key={s.id}>
                      <td><a href={`/owners?store=${s.id}&date=${date}`}><strong>{s.name}</strong></a></td>
                      <td className="r">{money(p?.total_sales)}</td><td className="r">{c ? money(c.deposit_amount) : '—'}</td>
                      <td className="r">{c?.difference != null ? signedMoney(c.difference) : '—'}</td>
                      <td className="r">{r ? money(r.qb_balance) : '—'}</td><td className="r">{deb ? money(deb) : '—'}</td>
                      <td>{r ? <span className="pill good">✓ Entered</span> : <span className="pill warn">Not entered</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        <section className="card scroll">
          <h2 style={{ marginBottom: 10 }}>Distributor checks · {new Date(date + 'T12:00:00Z').toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}</h2>
          {cs.length === 0 ? <p className="muted">No distributor checks entered this month.</p> : (
            <>
              <table className="num" style={{ minWidth: 700 }}>
                <thead><tr><th>Check date</th><th>Store</th><th>Distributor</th><th>Check #</th><th className="r">Amount</th></tr></thead>
                <tbody>{cs.map((c, i) => (
                  <tr key={i}><td>{c.check_date ?? c.business_date}</td><td>{name(c.business_id)}</td><td>{c.distributors?.name ?? '—'}</td><td>{c.check_number ?? '—'}</td><td className="r">{money(c.debit)}</td></tr>
                ))}</tbody>
                <tfoot><tr><td colSpan={4}><strong>Total</strong></td><td className="r"><strong>{money(cs.reduce((a, c) => a + Number(c.debit), 0))}</strong></td></tr></tfoot>
              </table>
              <div className="row" style={{ marginTop: 12 }}>
                {[...byDist.entries()].map(([d, amt]) => <span key={d} className="pill" style={{ background: '#f4f0e4' }}>{d}: {money(amt)}</span>)}
              </div>
            </>
          )}
        </section>
      </main>
    </>
  );
}
