import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { AdminNav } from '@/components/AdminNav';
import { Change } from '@/components/Change';
import { addDays, todayNY } from '@/lib/dates';
import { change, fmt, loadHistory, loadPos, METRIC_LABEL, total as totalOf, type HistRow, type PosRow, type Metric } from '@/lib/metrics';

export const dynamic = 'force-dynamic';

const lastDayOf = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const iso = (y: number, m: number, d: number) => `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
const minIso = (a: string, b: string) => (a < b ? a : b);
const shiftYear = (d: string, n: number) => {
  const y = Number(d.slice(0, 4)) + n, m = Number(d.slice(5, 7)), day = Math.min(Number(d.slice(8, 10)), lastDayOf(y, m));
  return iso(y, m, day);
};
const monthLabel = (y: number, m: number) => new Date(Date.UTC(y, m - 1, 15)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ month?: string; metric?: string }> }) {
  const me = await requireRole('admin', 'investor');
  const sp = await searchParams;
  const metric: Metric = (['sales', 'customers', 'ticket', 'margin'] as const).find((m) => m === sp.metric) ?? 'sales';
  const yesterday = addDays(todayNY(), -1);
  const [y, m] = (sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? sp.month : yesterday.slice(0, 7)).split('-').map(Number);
  const monthEnd = minIso(iso(y, m, lastDayOf(y, m)), yesterday);
  const monthStart = iso(y, m, 1);
  const elapsed = Number(monthEnd.slice(8, 10));

  // Previous month, same number of days
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  const prevStart = iso(py, pm, 1), prevEnd = iso(py, pm, Math.min(elapsed, lastDayOf(py, pm)));
  // Quarter to date, previous quarter same elapsed days
  const q = Math.floor((m - 1) / 3), qStart = iso(y, q * 3 + 1, 1);
  const qDays = Math.round((Date.parse(monthEnd) - Date.parse(qStart)) / 86400000);
  const pqStart = q === 0 ? iso(y - 1, 10, 1) : iso(y, (q - 1) * 3 + 1, 1);
  const pqEnd = minIso(addDays(pqStart, qDays), addDays(qStart, -1));
  const yStart = iso(y, 1, 1);

  const supabase = await supabaseServer();
  const { data: stores } = await supabase.from('businesses').select('id, name').eq('active', true).order('name');
  const ids = (stores ?? []).map((s) => s.id);
  const [rows, hist] = await Promise.all([loadPos(supabase, ids, iso(y - 1, 1, 1), monthEnd), loadHistory(supabase, ids, iso(y - 1, 1, 1), monthEnd)]);
  const total = (r: PosRow[], b: string, f: string, t: string, h: HistRow[] = hist) => totalOf(r, b, f, t, h);
  const isInvestor = me.role === 'investor';
  const monthOpts = Array.from({ length: 24 }, (_, i) => { const d = new Date(Date.UTC(Number(yesterday.slice(0, 4)), Number(yesterday.slice(5, 7)) - 1 - i, 15)); return [d.getUTCFullYear(), d.getUTCMonth() + 1] as const; });

  const periods = [
    { label: 'Month', sub: monthLabel(y, m) + (monthEnd < iso(y, m, lastDayOf(y, m)) ? ` (1–${elapsed})` : ''), cur: [monthStart, monthEnd], ly: [shiftYear(monthStart, -1), shiftYear(monthEnd, -1)], prev: [prevStart, prevEnd], prevLabel: 'vs last month (MOM)' },
    { label: 'Quarter', sub: `Q${q + 1} ${y} to date`, cur: [qStart, monthEnd], ly: [shiftYear(qStart, -1), shiftYear(monthEnd, -1)], prev: [pqStart, pqEnd], prevLabel: 'vs last quarter (QOQ)' },
    { label: 'Year', sub: `${y} to date`, cur: [yStart, monthEnd], ly: [shiftYear(yStart, -1), shiftYear(monthEnd, -1)], prev: null, prevLabel: '' },
  ] as const;

  return (
    <>
      <TopBar subtitle={isInvestor ? 'Investor Portal' : 'Management Portal'} who={`${me.email} · ${isInvestor ? 'Investor' : 'Admin'}`} />
      {!isInvestor && <AdminNav active="/dashboard" />}
      <main className="page" style={{ maxWidth: 1360 }}>
        <div className="row between">
          <div>
            {isInvestor && <a href="/investments" className="small">← Your investments</a>}
            <div className="eyebrow">{stores?.length ?? 0} stores · data through {yesterday}</div>
            <h1>{monthLabel(y, m)}</h1>
          </div>
          <form className="row" method="get">
            <select name="month" defaultValue={`${y}-${String(m).padStart(2, '0')}`} aria-label="Month" style={{ width: 'auto' }}>
              {monthOpts.map(([yy, mm]) => <option key={`${yy}-${mm}`} value={`${yy}-${String(mm).padStart(2, '0')}`}>{monthLabel(yy, mm)}</option>)}
            </select>
            <select name="metric" defaultValue={metric} aria-label="Measure" style={{ width: 'auto' }}>
              {(Object.keys(METRIC_LABEL) as Metric[]).map((k) => <option key={k} value={k}>{METRIC_LABEL[k]}</option>)}
            </select>
            <button className="btn secondary" type="submit">Show</button>
            {!isInvestor && <a className="btn secondary" href="/daily" style={{ textDecoration: 'none' }}>Day view</a>}
          </form>
        </div>

        <section className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
          {(stores ?? []).map((s) => {
            const cur = total(rows, s.id, monthStart, monthEnd), ly = total(rows, s.id, shiftYear(monthStart, -1), shiftYear(monthEnd, -1)), pv = total(rows, s.id, prevStart, prevEnd);
            return (
              <article key={s.id} className="card num" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <strong style={{ fontSize: 17 }}>{s.name}</strong>
                <div style={{ fontSize: 26, fontWeight: 600, color: 'var(--green)' }}>{fmt(cur, 'sales')}</div>
                <div className="small muted">{periods[0].sub} · revenue</div>
                <div className="small">YOY <Change c={change(cur, ly, 'sales')} /> · MOM <Change c={change(cur, pv, 'sales')} /></div>
                <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
                  <div className="small"><div className="muted">Customers</div><strong>{fmt(cur, 'customers')}</strong><div><Change c={change(cur, ly, 'customers')} /></div></div>
                  <div className="small"><div className="muted">Avg ticket</div><strong>{fmt(cur, 'ticket')}</strong><div><Change c={change(cur, ly, 'ticket')} /></div></div>
                  <div className="small"><div className="muted">Margin</div><strong>{fmt(cur, 'margin')}</strong><div><Change c={change(cur, ly, 'margin')} /></div></div>
                </div>
                <span className="small muted">{cur.hist ? 'Monthly totals from sales history' : `${cur.days} days of POS data`}{ly.days === 0 ? ' · last year not loaded yet' : ly.hist ? ' · last year from sales history' : ''}</span>
              </article>
            );
          })}
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h2>Month, quarter and year · {METRIC_LABEL[metric]}</h2>
          <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 560px), 1fr))' }}>
            {(stores ?? []).map((s) => (
              <article key={s.id} className="card scroll">
                <strong>{s.name}</strong>
                <table className="num" style={{ minWidth: 520, marginTop: 8 }}>
                  <thead><tr><th>Period</th><th className="r">This year</th><th className="r">Last year</th><th className="r">YOY</th><th className="r">Previous</th><th className="r">MOM / QOQ</th></tr></thead>
                  <tbody>
                    {periods.map((p) => {
                      const cur = total(rows, s.id, p.cur[0], p.cur[1]), ly = total(rows, s.id, p.ly[0], p.ly[1]);
                      const pv = p.prev ? total(rows, s.id, p.prev[0], p.prev[1]) : null;
                      return (
                        <tr key={p.label}>
                          <td><strong>{p.label}</strong><div className="small muted">{p.sub}</div></td>
                          <td className="r"><strong>{fmt(cur, metric)}</strong></td>
                          <td className="r">{fmt(ly, metric)}</td>
                          <td className="r"><Change c={change(cur, ly, metric)} /></td>
                          <td className="r">{pv ? fmt(pv, metric) : '—'}</td>
                          <td className="r">{pv ? <Change c={change(cur, pv, metric)} /> : '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </article>
            ))}
          </div>
          <p className="small muted">YOY compares the same dates last year. MOM and QOQ compare the same number of days in the previous month or quarter. Customers = POS transactions; avg ticket = revenue ÷ customers; margin = profit ÷ revenue. Months before the nightly POS reports come from Monthly sales history; ≈ means part of a month&apos;s total was spread evenly over its days, so treat it as an estimate.</p>
        </section>
      </main>
    </>
  );
}
