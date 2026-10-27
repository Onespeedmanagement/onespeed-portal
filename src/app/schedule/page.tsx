import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { ManagerNav } from '@/components/ManagerNav';
import { todayNY } from '@/lib/dates';
import { analyzeWeek, hourLabel, type DayHours, type ShiftRow } from '@/lib/schedule/analyze';
import { ScheduleUpload } from './Forms';

export const dynamic = 'force-dynamic';

const usd = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));
const addD = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const monday = (iso: string) => { const d = new Date(`${iso}T12:00:00Z`); return addD(iso, -((d.getUTCDay() + 6) % 7)); };
const short = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const COLORS = { under: '#f3c9bd', over: '#f6e3b0', ok: '#dcebdc', closed: 'transparent', unknown: '#f2f0ea' } as const;

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ store?: string; week?: string; saved?: string; open?: string; high?: string; low?: string; night?: string }> }) {
  const me = await requireRole('admin', 'manager');
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const { data: stores } = await supabase.from('stores').select('id, name').eq('active', true).order('name');
  const store = stores?.find((s) => s.id === sp.store) ?? stores?.[0];
  const t = {
    high: Math.min(200, Math.max(5, Number(sp.high) || 30)),
    low: Math.min(100, Math.max(1, Number(sp.low) || 12)),
    nightMin: Math.min(5, Math.max(1, Number(sp.night) || 2)),
  };

  // Default week: the latest uploaded week up to next week, else this week
  let week = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? monday(sp.week) : null;
  if (!week && store) {
    const { data: last } = await supabase.from('schedule_shifts').select('shift_date').eq('business_id', store.id).lte('shift_date', addD(todayNY(), 13)).order('shift_date', { ascending: false }).limit(1).maybeSingle();
    week = monday(last?.shift_date ?? todayNY());
  }
  week = week ?? monday(todayNY());
  const dates = Array.from({ length: 7 }, (_, i) => addD(week!, i));

  const [{ data: shiftRows }, { data: hist }] = store ? await Promise.all([
    supabase.from('schedule_shifts').select('shift_date, employee, position, start_min, end_min, rate').eq('business_id', store.id).gte('shift_date', dates[0]).lte('shift_date', dates[6]),
    supabase.rpc('store_hourly', { b: store.id, since: addD(week, -63) }),
  ]) : [{ data: [] }, { data: [] }];
  const shifts = ((shiftRows ?? []) as ShiftRow[]).map((s) => ({ ...s, rate: s.rate == null ? null : Number(s.rate) }));
  const history = ((hist ?? []) as DayHours[]).map((d) => ({ ...d, total_sales: d.total_sales == null ? null : Number(d.total_sales) }));
  const a = analyzeWeek(dates, shifts, history, t);
  const daysWithHourly = history.filter((d) => d.hourly?.length).length;
  const totLabor = a.days.reduce((s, d) => s + d.laborCost, 0);
  const totSales = a.days.reduce((s, d) => s + (d.sales ?? 0), 0);
  const savings = a.suggestions.filter((s) => s.kind === 'over').reduce((s, x) => s + (x.saving ?? 0), 0);
  const isAdmin = me.role === 'admin';
  const qs = (extra: Record<string, string>) => `/schedule?${new URLSearchParams({ ...(store ? { store: store.id } : {}), high: String(t.high), low: String(t.low), night: String(t.nightMin), ...extra })}`;

  return (
    <>
      <TopBar subtitle={isAdmin ? 'Management Portal' : 'Store Portal'} who={`${me.email} · ${isAdmin ? 'Admin' : 'Manager'}`} />
      <ManagerNav active="/schedule" admin={isAdmin} />
      <main className="page" style={{ maxWidth: 1400 }}>
        <div className="row between">
          <div>
            <h1>Employee Schedule Assistant</h1>
            <span className="small muted">{store?.name} · week of {short(dates[0])} – {short(dates[6])}</span>
          </div>
          <div className="row">
            <a className="btn secondary" href={qs({ week: addD(week, -7) })} style={{ textDecoration: 'none' }} aria-label="Previous week">‹</a>
            <a className="btn secondary" href={qs({ week: addD(week, 7) })} style={{ textDecoration: 'none' }} aria-label="Next week">›</a>
            {(stores?.length ?? 0) > 1 && (
              <form method="get" className="row">
                <select name="store" defaultValue={store?.id} aria-label="Store" style={{ width: 'auto' }}>{(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
                <button className="btn secondary" type="submit">Show</button>
              </form>
            )}
          </div>
        </div>

        {sp.saved && <div className="notice good">✓ Saved {sp.saved} shifts.{sp.open ? ` ${sp.open} open shift(s) with nobody assigned were left out.` : ''}</div>}
        {daysWithHourly < 7 && <div className="notice warn">Customer counts by hour come from the nightly POS reports and are saved from Oct 27 on. With {daysWithHourly} day{daysWithHourly === 1 ? '' : 's'} so far, “usual” traffic is rough; it sharpens as each weekday builds up a few weeks of history.</div>}

        {shifts.length === 0 ? (
          <div className="notice">No schedule uploaded for this week yet.</div>
        ) : (
          <>
            <section className="grid num" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}>
              {[
                ['Scheduled hours', Math.round(a.days.reduce((s, d) => s + d.laborHours, 0)).toString(), `${new Set(shifts.map((s) => s.employee)).size} people`],
                ['Labor cost', usd(totLabor), 'from the hourly rates in the schedule'],
                ['Sales', usd(totSales), a.days.every((d) => d.source === 'actual') ? 'actual' : 'actual where in, usual for the rest'],
                ['Labor % of sales', totSales ? `${((totLabor / totSales) * 100).toFixed(1)}%` : '—', ''],
                ['Short-staffed stretches', String(a.suggestions.filter((s) => s.kind === 'under').length), 'red on the chart'],
                ['Could save', usd(savings), 'by trimming quiet stretches'],
              ].map(([l, v, sub]) => (
                <div key={l} className="card"><span className="small muted">{l}</span><div style={{ fontSize: 22, fontWeight: 600, color: 'var(--green)' }}>{v}</div><span className="small muted">{sub}</span></div>
              ))}
            </section>

            {a.suggestions.length > 0 && (
              <section className="card" style={{ borderLeft: '4px solid var(--gold)' }}>
                <h2 style={{ marginBottom: 6 }}>Suggestions</h2>
                <ul style={{ margin: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 5 }}>
                  {a.suggestions.map((s, i) => <li key={i} className="small"><span style={{ color: s.kind === 'under' ? 'var(--bad)' : 'var(--warn)', fontWeight: 600 }}>{s.kind === 'under' ? 'Short-staffed' : 'Quiet'}</span> · {s.text}</li>)}
                </ul>
              </section>
            )}

            <section className="card scroll">
              <h2 style={{ marginBottom: 4 }}>People on vs customers, hour by hour</h2>
              <span className="small muted">Each box: <strong>people on</strong> / customers that hour. Red = more than {t.high} customers per person; amber = fewer than {t.low} per person with someone who could go.</span>
              <table className="num" style={{ minWidth: 160 + a.hours.length * 58, marginTop: 8, borderCollapse: 'separate', borderSpacing: 2 }}>
                <thead><tr><th>Day</th>{a.hours.map((h) => <th key={h} className="r small" style={{ fontWeight: 500 }}>{hourLabel(h)}</th>)}<th className="r small">Labor %</th></tr></thead>
                <tbody>
                  {a.days.map((d) => (
                    <tr key={d.date}>
                      <td style={{ whiteSpace: 'nowrap' }}><strong>{short(d.date)}</strong><div className="small muted">{d.source === 'actual' ? 'actual' : d.source === 'usual' ? `usual (${d.basedOn} day${d.basedOn === 1 ? '' : 's'})` : 'no history'}</div></td>
                      {d.cells.map((c) => (
                        <td key={c.hour} className="r small" style={{ background: COLORS[c.status], borderRadius: 4, padding: '4px 6px' }} title={c.sales != null ? `Sales ${usd(c.sales)} · labor ${usd(c.laborCost)}` : ''}>
                          {c.staff || c.customers ? <><strong>{c.staff}</strong>/{c.customers ?? '–'}</> : ''}
                        </td>
                      ))}
                      <td className="r small">{d.laborPct != null ? `${d.laborPct.toFixed(1)}%` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section className="card scroll">
              <h2 style={{ marginBottom: 8 }}>Who’s on</h2>
              <table className="small"><tbody>
                {a.days.map((d) => (
                  <tr key={d.date}><td style={{ whiteSpace: 'nowrap' }}><strong>{short(d.date)}</strong></td><td>
                    {shifts.filter((s) => s.shift_date === d.date).sort((x, y) => x.start_min - y.start_min).map((s) => `${s.employee} ${hourLabel(Math.floor(s.start_min / 60))}–${hourLabel(Math.floor(s.end_min / 60))}`).join(' · ') || '—'}
                  </td></tr>
                ))}
              </tbody></table>
            </section>
          </>
        )}

        <form method="get" className="card row" style={{ alignItems: 'flex-end' }}>
          {store && <input type="hidden" name="store" value={store.id} />}
          <input type="hidden" name="week" value={week} />
          <div className="field" style={{ flex: '0 1 220px' }}><label htmlFor="hi" className="small">Busy: customers per person per hour above</label><input id="hi" name="high" type="number" min={5} max={200} defaultValue={t.high} /></div>
          <div className="field" style={{ flex: '0 1 220px' }}><label htmlFor="lo" className="small">Quiet: customers per person per hour below</label><input id="lo" name="low" type="number" min={1} max={100} defaultValue={t.low} /></div>
          <div className="field" style={{ flex: '0 1 200px' }}><label htmlFor="ni" className="small">Always keep on after 9pm</label><input id="ni" name="night" type="number" min={1} max={5} defaultValue={t.nightMin} /></div>
          <button className="btn secondary" type="submit">Update</button>
        </form>

        {store && <ScheduleUpload businessId={store.id} storeName={store.name} />}
      </main>
    </>
  );
}
