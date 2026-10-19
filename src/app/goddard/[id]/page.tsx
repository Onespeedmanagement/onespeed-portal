import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { RoleNav } from '@/components/RoleNav';
import { ROLE_LABEL } from '@/lib/auth';
import { Change } from '@/components/Change';
import { addMonthsIso, afterDebt, collected, FILE_KINDS, loadMonths, margin, monthName, pct, type Line, type SchoolMonth } from '@/lib/goddard/schools';
import { deleteSchoolFile } from '../upload/actions';
import { SchoolFileUpload } from './SchoolFileUpload';

export const dynamic = 'force-dynamic';

const usd = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));
const pc = (n: number | null) => (n == null ? '—' : `${n.toFixed(1)}%`);
const amt = (ls: Line[] | undefined, label: string) => ls?.find((l) => l.label === label)?.amount ?? null;

export default async function SchoolPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ month?: string }> }) {
  const me = await requireRole('admin', 'investor', 'school_bookkeeper');
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const { data: school } = await supabase.from('businesses').select('id, name, pos_match').eq('id', id).maybeSingle();
  const { data: monthRows } = await supabase.from('school_months').select('month').eq('business_id', id).order('month', { ascending: false });
  const monthOpts = (monthRows ?? []).map((m) => m.month);
  const month = sp.month && /^\d{4}-\d{2}$/.test(sp.month) ? `${sp.month}-01` : monthOpts[0] ?? `${new Date().toISOString().slice(0, 7)}-01`;
  const history = school ? await loadMonths(supabase, [id], addMonthsIso(month, -12), month) : [];
  const cur = history.find((m) => m.month === month);
  const prev = history.find((m) => m.month === addMonthsIso(month, -1));
  const ly = history.find((m) => m.month === addMonthsIso(month, -12));
  const last3 = [1, 2, 3].map((k) => history.find((m) => m.month === addMonthsIso(month, -k))).filter(Boolean) as SchoolMonth[];
  const avg3 = (label: string) => last3.length ? last3.reduce((a, m) => a + (amt(m.expenses, label) ?? 0), 0) / last3.length : null;
  const { data: files } = await supabase.from('school_files').select('id, kind, filename, month, uploaded_by, uploaded_at').eq('business_id', id)
    .gte('month', addMonthsIso(month, -1)).lte('month', addMonthsIso(month, 1)).order('uploaded_at', { ascending: false });
  const canUpload = me.role === 'admin' || me.role === 'school_bookkeeper';
  const isInvestor = me.role === 'investor';

  // Things worth a look
  const flags: string[] = [];
  if (cur) {
    const royaltyPaid = amt(cur.expenses, 'Royalties'), mktPaid = amt(cur.expenses, 'Marketing');
    if (royaltyPaid != null && cur.royalties_due != null && Math.abs(royaltyPaid - cur.royalties_due) > 50)
      flags.push(`Royalties expense ${usd(royaltyPaid)} vs ${usd(cur.royalties_due)} due at 7% of cash receipts (${royaltyPaid > cur.royalties_due ? '+' : ''}${usd(royaltyPaid - cur.royalties_due)}).`);
    if (mktPaid != null && cur.marketing_due != null && Math.abs(mktPaid - cur.marketing_due) > 50)
      flags.push(`Marketing expense ${usd(mktPaid)} vs ${usd(cur.marketing_due)} marketing fee due at 2% (${mktPaid > cur.marketing_due ? '+' : ''}${usd(mktPaid - cur.marketing_due)}).`);
    const c = collected(cur);
    if (c != null && c < 95) flags.push(`Collected ${pc(c)} of what was billed (${usd((cur.revenue ?? 0) - (cur.cash_receipts ?? 0))} not collected this month).`);
    for (const e of cur.expenses) {
      const a = avg3(e.label);
      if (a != null && last3.length >= 2 && e.amount - a > 500 && e.amount > a * 1.25) flags.push(`${e.label} ${usd(e.amount)}, up ${usd(e.amount - a)} on the ${last3.length}-month average.`);
    }
    if ((afterDebt(cur) ?? 0) < 0) flags.push(`After debt service the month is negative: ${usd(afterDebt(cur))}.`);
  }

  return (
    <>
      <TopBar subtitle={isInvestor ? 'Investor Portal' : 'Management Portal'} who={`${me.email} · ${ROLE_LABEL[me.role]}`} />
      <RoleNav role={me.role} active="/goddard" />
      <main className="page" style={{ maxWidth: 1240 }}>
        <div className="row between">
          <div>
            <a href={`/goddard?month=${month.slice(0, 7)}`} className="small">← All schools</a>
            <div className="eyebrow" style={{ marginTop: 8 }}>{school?.pos_match ? `Goddard ${school.pos_match}` : 'Goddard School'}</div>
            <h1>{school?.name ?? 'School not found'}</h1>
            <span className="small muted">{monthName(month)}{cur?.report_date ? ` · FMS report dated ${cur.report_date}` : ''}</span>
          </div>
          {monthOpts.length > 0 && (
            <form method="get" className="row">
              <select name="month" defaultValue={month.slice(0, 7)} aria-label="Month" style={{ width: 'auto' }}>
                {monthOpts.map((m) => <option key={m} value={m.slice(0, 7)}>{monthName(m)}</option>)}
              </select>
              <button className="btn secondary" type="submit">Show</button>
            </form>
          )}
        </div>

        {school && !cur && <div className="notice warn">No FMS financial report for {monthName(month)} yet.{canUpload ? <> <Link href="/goddard/upload">Upload it</Link>.</> : ''}</div>}

        {cur && (
          <>
            <section className="grid num" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))' }}>
              {([
                ['Revenue', cur.revenue, prev?.revenue, ly?.revenue, 'Tuition + fees billed'],
                ['Operating expenses', cur.total_opex, prev?.total_opex, ly?.total_opex, `${pc(cur.revenue ? (cur.total_opex ?? 0) / cur.revenue * 100 : null)} of revenue`],
                ['Operating income', cur.operating_income, prev?.operating_income, ly?.operating_income, `${pc(margin(cur))} margin`],
                ['After debt service', afterDebt(cur), prev ? afterDebt(prev) : null, ly ? afterDebt(ly) : null, `Debt ${usd(cur.debt_service)}${cur.capex ? ` · capex ${usd(cur.capex)}` : ''}`],
                ['Cash collected', cur.cash_receipts, prev?.cash_receipts, ly?.cash_receipts, `${pc(collected(cur))} of billed`],
              ] as const).map(([label, v, p, y, sub]) => (
                <div key={label} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <span className="small muted">{label}</span>
                  <strong style={{ fontSize: 22, color: label === 'After debt service' && (v ?? 0) < 0 ? 'var(--bad)' : 'var(--green)' }}>{usd(v)}</strong>
                  <span className="small muted">{sub}</span>
                  <span className="small">MoM <Change c={pct(v, p ?? null)} />{y != null ? <> · YOY <Change c={pct(v, y)} /></> : null}</span>
                </div>
              ))}
            </section>

            {flags.length > 0 && (
              <section className="card" style={{ borderLeft: '4px solid var(--gold)' }}>
                <h2 style={{ marginBottom: 6 }}>Worth a look</h2>
                <ul style={{ margin: '0 0 0 18px', display: 'flex', flexDirection: 'column', gap: 4 }}>{flags.map((f) => <li key={f} className="small">{f}</li>)}</ul>
              </section>
            )}

            <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
              <section className="card scroll" style={{ flex: '1 1 380px' }}>
                <h2 style={{ marginBottom: 8 }}>Tuition by class</h2>
                <table className="num">
                  <thead><tr><th>Class</th><th className="r">{monthName(month, 'short')}</th><th className="r">Last month</th><th className="r">Change</th></tr></thead>
                  <tbody>
                    {cur.tuition.filter((l) => l.amount !== 0 || (amt(prev?.tuition, l.label) ?? 0) !== 0).map((l) => (
                      <tr key={l.label}><td>{l.label}</td><td className="r">{usd(l.amount)}</td><td className="r">{usd(amt(prev?.tuition, l.label))}</td><td className="r"><Change c={pct(l.amount, amt(prev?.tuition, l.label))} /></td></tr>
                    ))}
                  </tbody>
                  <tfoot><tr><td><strong>Total tuition</strong></td><td className="r"><strong>{usd(cur.tuition_total)}</strong></td><td className="r">{usd(prev?.tuition_total)}</td><td className="r"><Change c={pct(cur.tuition_total, prev?.tuition_total ?? null)} /></td></tr></tfoot>
                </table>
                <h2 style={{ margin: '18px 0 8px' }}>Fees &amp; discounts</h2>
                <table className="num">
                  <tbody>
                    {cur.other_fees.filter((l) => l.amount !== 0).map((l) => <tr key={l.label}><td>{l.label}</td><td className="r">{usd(l.amount)}</td></tr>)}
                    {cur.other_fees.every((l) => l.amount === 0) && <tr><td className="muted small">None this month.</td><td /></tr>}
                  </tbody>
                  <tfoot><tr><td><strong>Total other</strong></td><td className="r"><strong>{usd(cur.other_total)}</strong></td></tr></tfoot>
                </table>
                <p className="small muted" style={{ marginTop: 10 }}>Preschool rate {usd(cur.preschool_rate)}</p>
              </section>

              <section className="card scroll" style={{ flex: '1.3 1 460px' }}>
                <h2 style={{ marginBottom: 8 }}>Operating expenses</h2>
                <table className="num" style={{ minWidth: 520 }}>
                  <thead><tr><th>Expense</th><th className="r">{monthName(month, 'short')}</th><th className="r">% of rev.</th><th className="r">Last month</th><th className="r">{last3.length ? `${last3.length}-mo avg` : 'Avg'}</th></tr></thead>
                  <tbody>
                    {cur.expenses.filter((e) => e.amount !== 0 || (amt(prev?.expenses, e.label) ?? 0) !== 0).map((e) => {
                      const a = avg3(e.label);
                      const hot = a != null && last3.length >= 2 && e.amount - a > 500 && e.amount > a * 1.25;
                      return (
                        <tr key={e.label} style={hot ? { background: '#fbf1e4' } : undefined}>
                          <td>{e.label}{hot ? ' ⚠' : ''}</td><td className="r">{usd(e.amount)}</td>
                          <td className="r small">{pc(cur.revenue ? (e.amount / cur.revenue) * 100 : null)}</td>
                          <td className="r">{usd(amt(prev?.expenses, e.label))}</td><td className="r small">{usd(a)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr><td><strong>Total operating expense</strong></td><td className="r"><strong>{usd(cur.total_opex)}</strong></td><td className="r small">{pc(cur.revenue ? (cur.total_opex ?? 0) / cur.revenue * 100 : null)}</td><td className="r">{usd(prev?.total_opex)}</td><td /></tr>
                    <tr><td>Operating income</td><td className="r"><strong>{usd(cur.operating_income)}</strong></td><td className="r small">{pc(margin(cur))}</td><td className="r">{usd(prev?.operating_income)}</td><td /></tr>
                    <tr><td>Capital expenditures</td><td className="r">{usd(cur.capex)}</td><td /><td className="r">{usd(prev?.capex)}</td><td /></tr>
                    <tr><td>Debt service</td><td className="r">{usd(cur.debt_service)}</td><td /><td className="r">{usd(prev?.debt_service)}</td><td /></tr>
                    <tr><td><strong>After debt service</strong></td><td className="r"><strong>{usd(afterDebt(cur))}</strong></td><td /><td className="r">{usd(prev ? afterDebt(prev) : null)}</td><td /></tr>
                  </tfoot>
                </table>
              </section>
            </div>

            <section className="card num">
              <h2 style={{ marginBottom: 8 }}>Billing, cash &amp; royalties</h2>
              <table style={{ maxWidth: 560 }}>
                <tbody>
                  <tr><td>Billed (revenue)</td><td className="r">{usd(cur.revenue)}</td></tr>
                  <tr><td>Cash received</td><td className="r">{usd(cur.cash_receipts)}</td></tr>
                  <tr><td>Difference</td><td className="r">{usd((cur.cash_receipts ?? 0) - (cur.revenue ?? 0))}</td></tr>
                  <tr><td>Royalties due (7% of cash)</td><td className="r">{usd(cur.royalties_due)}</td></tr>
                  <tr><td>Marketing fee due (2% of cash)</td><td className="r">{usd(cur.marketing_due)}</td></tr>
                </tbody>
              </table>
              {cur.explanations && <div className="notice warn" style={{ marginTop: 10, whiteSpace: 'pre-line' }}>School’s explanation: {cur.explanations}</div>}
            </section>
          </>
        )}

        {school && (
          <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2>Reports</h2>
            <span className="small muted">Showing {monthName(addMonthsIso(month, -1), 'short')} – {monthName(addMonthsIso(month, 1), 'short')}. “New families starting next month” is filed under the month it was run.</span>
            {(files ?? []).length === 0 ? <p className="muted small">No reports uploaded for these months.</p> : (
              <table style={{ minWidth: 480 }}>
                <thead><tr><th>Report</th><th>Month</th><th>File</th>{canUpload && <th />}</tr></thead>
                <tbody>
                  {(files ?? []).map((f) => (
                    <tr key={f.id}>
                      <td>{FILE_KINDS[f.kind] ?? f.kind}</td><td className="small">{monthName(f.month, 'short')}</td>
                      <td><a href={`/goddard/file/${f.id}`} target="_blank" rel="noopener">{f.filename}</a></td>
                      {canUpload && <td className="r"><form action={deleteSchoolFile}><input type="hidden" name="id" value={f.id} /><button className="link small" type="submit">Remove</button></form></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
            {canUpload && <SchoolFileUpload businessId={id} month={month} />}
          </section>
        )}
      </main>
    </>
  );
}
