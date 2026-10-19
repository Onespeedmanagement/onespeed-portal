import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { RoleNav } from '@/components/RoleNav';
import { Change } from '@/components/Change';
import { addMonthsIso, afterDebt, collected, loadMonths, loadSchools, margin, monthName, pct, type SchoolMonth } from '@/lib/goddard/schools';

export const dynamic = 'force-dynamic';

const usd = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));
const pc = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)}%`);

export default async function GoddardPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const me = await requireRole('admin', 'investor');
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const { schools } = await loadSchools(supabase);
  const ids = schools.map((s) => s.id);
  const { data: latestRow } = ids.length ? await supabase.from('school_months').select('month').in('business_id', ids).order('month', { ascending: false }).limit(1).maybeSingle() : { data: null };
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? `${sp.month}-01` : latestRow?.month ?? null;
  const months = month ? await loadMonths(supabase, ids, addMonthsIso(month, -12), month) : [];
  const at = (id: string, m: string) => months.find((x) => x.business_id === id && x.month === m);
  const trendMonths = month ? Array.from({ length: 12 }, (_, i) => addMonthsIso(month, i - 11)) : [];
  const { data: allMonths } = ids.length ? await supabase.from('school_months').select('month').in('business_id', ids).order('month', { ascending: false }).limit(400) : { data: [] };
  const monthOpts = [...new Set((allMonths ?? []).map((m) => m.month))];
  const canUpload = me.role === 'admin';
  const isInvestor = me.role === 'investor';

  const total = (ms: (SchoolMonth | undefined)[]) => {
    const got = ms.filter(Boolean) as SchoolMonth[];
    if (!got.length) return null;
    const s = (k: keyof SchoolMonth) => got.reduce((a, m) => a + Number(m[k] ?? 0), 0);
    return { revenue: s('revenue'), operating_income: s('operating_income'), debt_service: s('debt_service'), capex: s('capex'), cash_receipts: s('cash_receipts'), total_opex: s('total_opex') } as SchoolMonth;
  };

  return (
    <>
      <TopBar subtitle={isInvestor ? 'Investor Portal' : 'Goddard Schools'} who={`${me.email} · ${me.role[0].toUpperCase() + me.role.slice(1)}`} />
      <RoleNav role={me.role} active="/goddard" />
      <main className="page" style={{ maxWidth: 1360 }}>
        <div className="row between">
          <div>
            {isInvestor && <a href="/investments" className="small">← Your investments</a>}
            <div className="eyebrow">Goddard Schools · monthly</div>
            <h1>{month ? monthName(month) : 'Goddard Schools'}</h1>
          </div>
          <div className="row">
            {monthOpts.length > 0 && (
              <form method="get" className="row">
                <select name="month" defaultValue={month?.slice(0, 7)} aria-label="Month" style={{ width: 'auto' }}>
                  {monthOpts.map((m) => <option key={m} value={m.slice(0, 7)}>{monthName(m)}</option>)}
                </select>
                <button className="btn secondary" type="submit">Show</button>
              </form>
            )}
            {canUpload && <Link className="btn" href="/goddard/upload" style={{ textDecoration: 'none' }}>Upload reports</Link>}
          </div>
        </div>

        {schools.length === 0 && <div className="notice warn">{canUpload ? 'No schools yet. Upload an FMS Monthly Financial Report and add the school from the result.' : 'No schools have been shared with you yet.'}</div>}
        {schools.length > 0 && !month && <div className="notice warn">No monthly reports loaded yet.{canUpload ? ' Upload the FMS Monthly Financial Report to get started.' : ''}</div>}

        {month && (
          <section className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
            {schools.map((s) => {
              const cur = at(s.id, month), prev = at(s.id, addMonthsIso(month, -1)), ly = at(s.id, addMonthsIso(month, -12));
              return (
                <a key={s.id} href={`/goddard/${s.id}?month=${month.slice(0, 7)}`} className="card num" style={{ display: 'flex', flexDirection: 'column', gap: 10, textDecoration: 'none', color: 'inherit' }}>
                  <strong style={{ fontSize: 17 }}>{s.name}</strong>
                  {!cur ? <span className="muted small">No report for {monthName(month, 'short')} yet.</span> : (
                    <>
                      <div><div className="small muted">Revenue</div><div style={{ fontSize: 26, fontWeight: 600, color: 'var(--green)' }}>{usd(cur.revenue)}</div>
                        <div className="small">vs last month <Change c={pct(cur.revenue, prev?.revenue ?? null)} />{ly ? <> · YOY <Change c={pct(cur.revenue, ly.revenue)} /></> : null}</div></div>
                      <div className="grid" style={{ gridTemplateColumns: 'repeat(3, minmax(0,1fr))', gap: 8 }}>
                        <div className="small"><div className="muted">Operating income</div><strong>{usd(cur.operating_income)}</strong><div className="muted">{pc(margin(cur))} margin</div></div>
                        <div className="small"><div className="muted">After debt service</div><strong style={{ color: (afterDebt(cur) ?? 0) < 0 ? 'var(--bad)' : undefined }}>{usd(afterDebt(cur))}</strong><div className="muted">debt {usd(cur.debt_service)}</div></div>
                        <div className="small"><div className="muted">Cash collected</div><strong>{usd(cur.cash_receipts)}</strong><div className="muted">{pc(collected(cur))} of billed</div></div>
                      </div>
                    </>
                  )}
                </a>
              );
            })}
            {schools.length > 1 && (() => {
              const t = total(schools.map((s) => at(s.id, month)));
              return t && (
                <div className="card num" style={{ display: 'flex', flexDirection: 'column', gap: 8, background: '#f4f0e4' }}>
                  <strong style={{ fontSize: 17 }}>All schools</strong>
                  <div style={{ fontSize: 26, fontWeight: 600, color: 'var(--green)' }}>{usd(t.revenue)}</div>
                  <div className="small">Operating income <strong>{usd(t.operating_income)}</strong> · {pc(margin(t))}</div>
                  <div className="small">After debt service <strong>{usd(afterDebt(t))}</strong></div>
                </div>
              );
            })()}
          </section>
        )}

        {month && schools.length > 0 && (
          <section className="card scroll">
            <h2 style={{ marginBottom: 10 }}>Last 12 months</h2>
            {schools.map((s) => (
              <div key={s.id} style={{ marginBottom: 18 }}>
                <strong>{s.name}</strong>
                <table className="num" style={{ minWidth: 300 + trendMonths.length * 78, marginTop: 6 }}>
                  <thead><tr><th />{trendMonths.map((m) => <th key={m} className="r">{new Date(`${m.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' })}</th>)}</tr></thead>
                  <tbody>
                    {([['Revenue', (m: SchoolMonth) => usd(m.revenue)], ['Expenses', (m: SchoolMonth) => usd(m.total_opex)], ['Operating income', (m: SchoolMonth) => usd(m.operating_income)],
                      ['Margin', (m: SchoolMonth) => pc(margin(m))], ['After debt service', (m: SchoolMonth) => usd(afterDebt(m))]] as const).map(([label, f]) => (
                      <tr key={label}><td><strong>{label}</strong></td>{trendMonths.map((m) => { const r = at(s.id, m); return <td key={m} className="r small">{r ? f(r) : '—'}</td>; })}</tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </section>
        )}
        <p className="small muted">From each school’s FMS Monthly Financial Report. Operating income = revenue − operating expenses. After debt service = operating income − debt service − capital expenditures. Cash collected = cash receipts as a share of what was billed that month.</p>
      </main>
    </>
  );
}
