import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { AdminNav } from '@/components/AdminNav';
import { HolidayTag } from '@/components/HolidayTag';
import { money, signedMoney } from '@/lib/format';
import { addDays, shortDate, todayNY } from '@/lib/dates';
import { getTolerance, loadDays, STATUS_PILL } from '@/lib/closeouts';

export const dynamic = 'force-dynamic';

export default async function CashPage({ searchParams }: { searchParams: Promise<{ store?: string; days?: string }> }) {
  const me = await requireRole('admin');
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const { data: stores } = await supabase.from('stores').select('id, name').eq('active', true).order('name');
  const store = stores?.find((s) => s.id === sp.store) ?? stores?.[0];
  const days = [7, 14, 30, 60].includes(Number(sp.days)) ? Number(sp.days) : 14;
  const to = addDays(todayNY(), -1);
  const from = addDays(to, -(days - 1));
  const tolerance = await getTolerance(supabase);
  const rows = store ? await loadDays(supabase, store.id, from, to, tolerance) : [];
  const { data: marks } = store
    ? await supabase.from('qb_marks').select('business_date, entered, marked_by').eq('business_id', store.id).gte('business_date', from).lte('business_date', to)
    : { data: [] };
  const qb = (d: string) => marks?.find((m) => m.business_date === d && m.entered);

  const closed = rows.filter((r) => r.closeout && r.closeout.difference != null);
  const shorts = closed.filter((r) => r.status === 'short');
  const overs = closed.filter((r) => r.status === 'over');
  const byEmp = new Map<string, { short: number; over: number; shortDays: number; overDays: number }>();
  for (const r of [...shorts, ...overs]) {
    const who = r.employees.length ? r.employees : ['Not assigned'];
    for (const name of who) {
      const e = byEmp.get(name) ?? { short: 0, over: 0, shortDays: 0, overDays: 0 };
      if (r.status === 'short') { e.short += r.closeout!.difference!; e.shortDays++; } else { e.over += r.closeout!.difference!; e.overDays++; }
      byEmp.set(name, e);
    }
  }
  const sum = (xs: number[]) => Math.round(xs.reduce((a, b) => a + b, 0) * 100) / 100;

  return (
    <>
      <TopBar subtitle="Management Portal" who={`${me.email} · Admin`} />
      <AdminNav active="/cash" />
      <main className="page" style={{ maxWidth: 1360 }}>
        <div className="row between">
          <div>
            <div className="eyebrow">Admins only</div>
            <h1>Cash &amp; deposits</h1>
            <span className="small muted">POS sales, the manager&apos;s count, and the difference for every day. Matched = within ±{money(tolerance)}.</span>
          </div>
          <form className="row" method="get">
            <label htmlFor="store" className="small muted">Store</label>
            <select id="store" name="store" defaultValue={store?.id} style={{ width: 'auto' }}>
              {(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <label htmlFor="days" className="small muted">Days</label>
            <select id="days" name="days" defaultValue={String(days)} style={{ width: 'auto' }}>
              {[7, 14, 30, 60].map((d) => <option key={d} value={d}>Last {d}</option>)}
            </select>
            <button className="btn secondary" type="submit">Show</button>
          </form>
        </div>

        <section className="grid num">
          <div className="card"><span className="small muted">Days matched</span><div style={{ fontSize: 26, fontWeight: 600 }}>{closed.filter((r) => r.status === 'matched').length} of {closed.length}</div></div>
          <div className="card"><span className="small muted">Total short</span><div style={{ fontSize: 26, fontWeight: 600, color: 'var(--bad)' }}>{signedMoney(sum(shorts.map((r) => r.closeout!.difference!)))}</div><span className="small muted">{shorts.length} days</span></div>
          <div className="card"><span className="small muted">Total over</span><div style={{ fontSize: 26, fontWeight: 600, color: 'var(--warn)' }}>{signedMoney(sum(overs.map((r) => r.closeout!.difference!)))}</div><span className="small muted">{overs.length} days</span></div>
          <div className="card"><span className="small muted">Missing close-outs</span><div style={{ fontSize: 26, fontWeight: 600 }}>{rows.filter((r) => r.status === 'missing_closeout').length}</div></div>
        </section>

        <section className="card scroll">
          <h2 style={{ marginBottom: 10 }}>Daily cash log · {store?.name}</h2>
          {rows.length === 0 ? <p className="muted">No POS reports or close-outs in this range yet.</p> : (
            <table className="num" style={{ minWidth: 1100 }}>
              <thead><tr><th>Date</th><th className="r">Card (POS)</th><th className="r">Cash (POS)</th><th className="r">Total sales</th><th className="r">Cash counted</th><th className="r">Paid out / petty</th><th className="r">Difference</th><th>Status</th><th>Who / note</th><th className="r">Deposit</th><th>QuickBooks</th></tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r.date}>
                    <td style={{ whiteSpace: 'nowrap' }}>{shortDate(r.date)}<HolidayTag date={r.date} /></td>
                    <td className="r">{money(r.pos?.card_sales)}</td>
                    <td className="r">{money(r.pos?.cash_sales)}</td>
                    <td className="r">{money(r.pos?.total_sales)}</td>
                    <td className="r">{r.closeout ? money(r.closeout.cash_counted) : '—'}</td>
                    <td className="r small">{r.closeout ? <>
                      {r.closeout.paid_out ? <div>{money(r.closeout.paid_out)}{r.closeout.paid_out_reason ? ` · ${r.closeout.paid_out_reason}` : ''}</div> : null}
                      {r.closeout.petty_change ? <div>{money(r.closeout.petty_change)} · petty</div> : null}
                      {!r.closeout.paid_out && !r.closeout.petty_change ? '—' : null}
                    </> : '—'}</td>
                    <td className="r" style={{ color: r.status === 'short' ? 'var(--bad)' : r.status === 'over' ? 'var(--warn)' : undefined }}>
                      {r.closeout?.difference != null ? signedMoney(r.closeout.difference) : '—'}</td>
                    <td><span className={`pill ${STATUS_PILL[r.status][0]}`}>{STATUS_PILL[r.status][1]}</span></td>
                    <td className="small">{r.employees.join(', ') || (r.closeout ? <span className="muted">—</span> : '')}
                      {r.closeout?.note ? <div className="muted">“{r.closeout.note}”</div> : null}
                      {r.closeout ? <div className="muted">by {r.closeout.submitted_by}</div> : null}</td>
                    <td className="r">{r.closeout ? money(r.closeout.deposit_amount) : '—'}</td>
                    <td>{qb(r.date) ? <span className="pill good">✓ Entered</span> : <span className="small muted">Not yet</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="small muted" style={{ marginTop: 10 }}>Difference = cash counted + paid out + petty change − POS cash (net cash-flow).</p>
        </section>

        <section className="card scroll">
          <h2 style={{ marginBottom: 10 }}>By employee · last {days} days</h2>
          {byEmp.size === 0 ? <p className="muted">No short or over days in this range.</p> : (
            <table className="num">
              <thead><tr><th>Employee</th><th className="r">Short</th><th className="r">Over</th><th className="r">Net</th></tr></thead>
              <tbody>
                {[...byEmp.entries()].map(([name, e]) => (
                  <tr key={name}><td>{name}</td>
                    <td className="r" style={{ color: 'var(--bad)' }}>{e.shortDays ? `${signedMoney(e.short)} (${e.shortDays})` : '—'}</td>
                    <td className="r" style={{ color: 'var(--warn)' }}>{e.overDays ? `${signedMoney(e.over)} (${e.overDays})` : '—'}</td>
                    <td className="r">{signedMoney(Math.round((e.short + e.over) * 100) / 100)}</td></tr>
                ))}
              </tbody>
            </table>
          )}
          <p className="small muted" style={{ marginTop: 10 }}>Counts only days outside ±{money(tolerance)}. A day with two people on the register counts for both.</p>
        </section>
      </main>
    </>
  );
}
