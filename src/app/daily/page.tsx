import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { AdminNav } from '@/components/AdminNav';
import { Change } from '@/components/Change';
import { HolidayTag } from '@/components/HolidayTag';
import { addDays, shortDate, todayNY } from '@/lib/dates';
import { holidayOn, holidaysFor } from '@/lib/holidays';
import { longDate } from '@/lib/format';
import { change, fmt, loadPos, total } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

export default async function DailyPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const me = await requireRole('admin');
  const sp = await searchParams;
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : addDays(todayNY(), -1);
  const lastWeek = addDays(date, -7);
  const holiday = holidayOn(date);
  const lyHoliday = holiday ? holidaysFor(Number(date.slice(0, 4)) - 1).find((h) => h.name === holiday.name) : undefined;
  const lastYear = lyHoliday?.date ?? addDays(date, -364);   // same weekday last year, or the same holiday
  const monthStart = date.slice(0, 8) + '01';
  const lyMonthStart = addDays(monthStart, -364), lyMonthEnd = addDays(date, -364);
  const weekStart = addDays(date, -6);

  const supabase = await supabaseServer();
  const { data: stores } = await supabase.from('businesses').select('id, name').eq('active', true).order('name');
  const ids = (stores ?? []).map((s) => s.id);
  const rows = await loadPos(supabase, ids, addDays(monthStart, -400), date);
  const upcoming = [...holidaysFor(Number(todayNY().slice(0, 4))), ...holidaysFor(Number(todayNY().slice(0, 4)) + 1)].filter((h) => h.date >= todayNY()).slice(0, 5);

  return (
    <>
      <TopBar subtitle="Management Portal" who={`${me.email} · Admin`} />
      <AdminNav active="/dashboard" />
      <main className="page" style={{ maxWidth: 1360 }}>
        <div className="row between">
          <div>
            <div className="eyebrow">Daily view · from the POS reports</div>
            <h1>{longDate(date)}</h1>
            <span className="small">{holiday ? <><HolidayTag date={date} /> compared with {holiday.name} last year ({lastYear})</> : 'No holiday'}</span>
          </div>
          <form className="row" method="get">
            <a className="btn secondary" href={`/daily?date=${addDays(date, -1)}`} style={{ textDecoration: 'none' }} aria-label="Previous day">‹</a>
            <input type="date" name="date" defaultValue={date} aria-label="Day" style={{ width: 'auto' }} />
            <a className="btn secondary" href={`/daily?date=${addDays(date, 1)}`} style={{ textDecoration: 'none' }} aria-label="Next day">›</a>
            <button className="btn secondary" type="submit">Show</button>
            <a className="btn secondary" href="/dashboard" style={{ textDecoration: 'none' }}>Month view</a>
          </form>
        </div>

        <section className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 420px), 1fr))' }}>
          {(stores ?? []).map((s) => {
            const d = total(rows, s.id, date, date), w = total(rows, s.id, lastWeek, lastWeek), l = total(rows, s.id, lastYear, lastYear);
            const mtd = total(rows, s.id, monthStart, date), lmtd = total(rows, s.id, lyMonthStart, lyMonthEnd);
            const week = Array.from({ length: 7 }, (_, i) => addDays(weekStart, i));
            const max = Math.max(1, ...week.flatMap((x) => [total(rows, s.id, x, x).sales, total(rows, s.id, addDays(x, -364), addDays(x, -364)).sales]));
            return (
              <article key={s.id} className="card num" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                <strong style={{ fontSize: 17 }}>{s.name}</strong>
                {d.days === 0 ? <div className="notice warn">No POS report for this day yet.</div> : <>
                  <div style={{ fontSize: 30, fontWeight: 600, color: 'var(--green)' }}>{fmt(d, 'sales')}</div>
                  <table><tbody>
                    <tr><td className="muted">vs last {shortDate(date).split(',')[0]} ({lastWeek})</td><td className="r">{fmt(w, 'sales')}</td><td className="r"><Change c={change(d, w, 'sales')} /></td></tr>
                    <tr><td className="muted">vs {holiday ? `${holiday.name} last year` : 'same weekday last year'} ({lastYear})</td><td className="r">{fmt(l, 'sales')}</td><td className="r"><Change c={change(d, l, 'sales')} /></td></tr>
                  </tbody></table>
                  <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
                    <div className="small"><div className="muted">Customers</div><strong>{fmt(d, 'customers')}</strong></div>
                    <div className="small"><div className="muted">Avg ticket</div><strong>{fmt(d, 'ticket')}</strong></div>
                    <div className="small"><div className="muted">Margin</div><strong>{fmt(d, 'margin')}</strong></div>
                  </div>
                </>}
                <div className="small" style={{ background: '#f4f0e4', borderRadius: 8, padding: '10px 12px' }}>
                  Month to date: <strong>{fmt(mtd, 'sales')}</strong> vs {fmt(lmtd, 'sales')} last year · <Change c={change(mtd, lmtd, 'sales')} />
                </div>
                <div>
                  <div className="small muted" style={{ marginBottom: 6 }}>Last 7 days · light = last year, dark = this year</div>
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 6, height: 110, borderBottom: '1px solid #cfc6ae' }}>
                    {week.map((x) => {
                      const t = total(rows, s.id, x, x).sales, ly = total(rows, s.id, addDays(x, -364), addDays(x, -364)).sales;
                      return (
                        <div key={x} style={{ flex: 1, display: 'flex', alignItems: 'flex-end', gap: 2, justifyContent: 'center', height: '100%' }}>
                          <div title={`${x} last year: $${ly.toFixed(2)}`} style={{ width: '40%', height: `${(ly / max) * 100}%`, background: '#c9d3c8', borderRadius: '3px 3px 0 0' }} />
                          <div title={`${x}: $${t.toFixed(2)}`} style={{ width: '40%', height: `${(t / max) * 100}%`, background: 'var(--green)', borderRadius: '3px 3px 0 0' }} />
                        </div>
                      );
                    })}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>{week.map((x) => <span key={x} className="small muted" style={{ flex: 1, textAlign: 'center' }}>{shortDate(x).split(',')[0]}</span>)}</div>
                </div>
              </article>
            );
          })}
        </section>

        <section className="card">
          <h2 style={{ marginBottom: 8 }}>Upcoming holidays &amp; big sales days</h2>
          <table><tbody>
            {upcoming.map((h) => (
              <tr key={h.date}><td style={{ whiteSpace: 'nowrap' }}>{shortDate(h.date)}</td><td><span className="pill" style={{ background: h.kind === 'federal' ? '#e3e8f2' : 'var(--warn-bg)', color: h.kind === 'federal' ? '#2b3e66' : 'var(--warn)' }}>{h.name}</span></td>
                <td className="small muted">Compared with {h.name} last year</td></tr>
            ))}
          </tbody></table>
        </section>
      </main>
    </>
  );
}
