import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { BookkeeperNav } from '@/components/BookkeeperNav';
import { HolidayTag } from '@/components/HolidayTag';
import { money, signedMoney } from '@/lib/format';
import { addDays, shortDate, todayNY } from '@/lib/dates';
import { getTolerance, loadDays, STATUS_PILL } from '@/lib/closeouts';
import { EnteredBox } from './EnteredBox';
import { askAdmin } from './actions';

export const dynamic = 'force-dynamic';

export default async function BookkeeperPage({ searchParams }: { searchParams: Promise<{ store?: string; days?: string }> }) {
  const me = await requireRole('bookkeeper');
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const { data: stores } = await supabase.from('businesses').select('id, name').eq('active', true).order('name');
  const store = stores?.find((s) => s.id === sp.store) ?? stores?.[0];
  const days = [7, 14, 30, 60].includes(Number(sp.days)) ? Number(sp.days) : 14;
  const to = addDays(todayNY(), -1);
  const from = addDays(to, -(days - 1));
  const tolerance = await getTolerance(supabase);
  const rows = store ? await loadDays(supabase, store.id, from, to, tolerance) : [];
  const { data: marks } = store
    ? await supabase.from('qb_marks').select('business_date, entered').eq('business_id', store.id).gte('business_date', from).lte('business_date', to)
    : { data: [] };
  const { data: myQs } = store
    ? await supabase.from('questions').select('business_date, body, resolved, admin_note').eq('business_id', store.id).gte('business_date', from)
    : { data: [] };
  const entered = (d: string) => !!marks?.find((m) => m.business_date === d && m.entered);
  const ready = rows.filter((r) => r.closeout && r.pos && !entered(r.date)).length;

  return (
    <>
      <TopBar subtitle="Bookkeeping" who={`${me.email} · Bookkeeper`} />
      <BookkeeperNav active="/bookkeeper" />
      <main className="page" style={{ maxWidth: 1360 }}>
        <div className="row between">
          <div>
            <div className="eyebrow">For QuickBooks</div>
            <h1>Daily entries</h1>
            <span className="small muted">Sales from the POS and cash confirmed by the store manager. Tick each day once it&apos;s in QuickBooks.</span>
          </div>
          <form className="row" method="get">
            <select name="store" defaultValue={store?.id} aria-label="Store" style={{ width: 'auto' }}>
              {(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <select name="days" defaultValue={String(days)} aria-label="Days" style={{ width: 'auto' }}>
              {[7, 14, 30, 60].map((d) => <option key={d} value={d}>Last {d} days</option>)}
            </select>
            <button className="btn secondary" type="submit">Show</button>
          </form>
        </div>
        <div className="grid num">
          <div className="stat"><span className="small muted">Ready to enter</span><strong>{ready} days</strong></div>
          <div className="stat"><span className="small muted">Entered in QuickBooks</span><strong>{rows.filter((r) => entered(r.date)).length} days</strong></div>
          <div className="stat"><span className="small muted">Waiting on the manager</span><strong>{rows.filter((r) => r.status === 'missing_closeout').length} days</strong></div>
        </div>
        <section className="card scroll">
          {rows.length === 0 ? <p className="muted">Nothing in this range yet.</p> : (
            <table className="num" style={{ minWidth: 1180 }}>
              <thead><tr><th>Date</th><th className="r">Card sales</th><th className="r">Cash sales</th><th className="r">Total sales</th><th className="r">Paid out / petty</th><th className="r">Over / short</th><th>Employee</th><th className="r">Deposit</th><th>Status</th><th>QuickBooks</th><th>Question for admin</th></tr></thead>
              <tbody>
                {rows.map((r) => {
                  const q = myQs?.filter((x) => x.business_date === r.date) ?? [];
                  return (
                    <tr key={r.date}>
                      <td style={{ whiteSpace: 'nowrap' }}>{shortDate(r.date)}<HolidayTag date={r.date} /><div><a className="small" href={`/bookkeeper/edit?store=${store!.id}&date=${r.date}`}>Edit numbers</a></div></td>
                      <td className="r">{money(r.pos?.card_sales)}</td>
                      <td className="r">{money(r.pos?.cash_sales)}</td>
                      <td className="r">{money(r.pos?.total_sales)}</td>
                      <td className="r small">{r.closeout ? <>
                        {r.closeout.paid_out ? <div>{money(r.closeout.paid_out)}{r.closeout.paid_out_reason ? ` · ${r.closeout.paid_out_reason}` : ''}</div> : null}
                        {r.closeout.petty_change ? <div>{money(r.closeout.petty_change)} · petty</div> : null}
                        {!r.closeout.paid_out && !r.closeout.petty_change ? '—' : null}</> : '—'}</td>
                      <td className="r">{r.closeout?.difference != null ? signedMoney(r.closeout.difference) : '—'}</td>
                      <td className="small">{r.employees.join(', ') || '—'}</td>
                      <td className="r">{r.closeout ? money(r.closeout.deposit_amount) : '—'}</td>
                      <td><span className={`pill ${STATUS_PILL[r.status][0]}`}>{STATUS_PILL[r.status][1]}</span></td>
                      <td>{r.closeout && r.pos ? <EnteredBox businessId={store!.id} date={r.date} entered={entered(r.date)} /> : <span className="small muted">Not ready</span>}</td>
                      <td className="small" style={{ minWidth: 240 }}>
                        {q.map((x, i) => <div key={i} className="muted">{x.resolved ? `✓ ${x.admin_note ?? 'Resolved'}` : `Asked: “${x.body}”`}</div>)}
                        <form action={askAdmin} className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                          <input type="hidden" name="business_id" value={store!.id} />
                          <input type="hidden" name="business_date" value={r.date} />
                          <input type="text" name="body" placeholder="Ask about this day" aria-label="Question" style={{ minHeight: 36, padding: '6px 8px', fontSize: 13 }} />
                          <button className="btn secondary" type="submit" style={{ minHeight: 36, padding: '6px 10px' }}>Ask</button>
                        </form>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </section>
        <p className="small muted">View only: these numbers come from the POS and the manager&apos;s close-out. Enter QB balances and checks under Owners Report.</p>
      </main>
    </>
  );
}
