import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { longDate, money, signedMoney } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function InvestmentsPage() {
  const me = await requireRole('investor');
  const supabase = await supabaseServer();
  const [{ data: self }, { data: biz }, { data: portfolios }] = await Promise.all([
    supabase.from('app_users').select('display_name, can_see_sales, can_see_owners, can_see_cash').eq('email', me.email).single(),
    supabase.from('businesses').select('id, name, portfolio_id').eq('active', true).order('name'),
    supabase.from('portfolios').select('id, name, status, kind').order('sort'),
  ]);
  const none = Promise.resolve({ data: [] as never[] });
  const [{ data: latest }, { data: cash }, { data: qb }, { data: schoolMonths }] = await Promise.all([
    self?.can_see_sales ? supabase.from('pos_daily').select('business_id, business_date, total_sales, profit_pct').order('business_date', { ascending: false }).limit(100) : none,
    self?.can_see_cash ? supabase.from('closeout_results').select('business_id, business_date, deposit_amount, difference').order('business_date', { ascending: false }).limit(100) : none,
    self?.can_see_owners ? supabase.from('owners_report').select('business_id, business_date, qb_balance').order('business_date', { ascending: false }).limit(100) : none,
    supabase.from('school_months').select('business_id, month, revenue, operating_income').order('month', { ascending: false }).limit(100),
  ]);
  const usd0 = (n: number | null) => (n == null ? '—' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));
  const groups = (portfolios ?? []).map((p) => ({ ...p, list: (biz ?? []).filter((b) => b.portfolio_id === p.id) })).filter((g) => g.list.length);

  return (
    <>
      <TopBar subtitle="Investor Portal" who={`${me.email} · Investor · View only`} />
      <main className="page">
        <div>
          <div className="eyebrow">Welcome{self?.display_name ? `, ${self.display_name}` : ''}</div>
          <h1>Your investments</h1>
          <span className="small muted">You see only the businesses OneSpeed has shared with you.</span>
        </div>
        {groups.length === 0 && <div className="notice warn">Nothing has been shared with you yet. Contact OneSpeed Management.</div>}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', alignItems: 'start' }}>
          {groups.map((g) => (
            <section key={g.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: `4px solid ${g.status === 'live' ? 'var(--green)' : 'var(--gold)'}` }}>
              <div className="row between"><h2 style={{ fontSize: 28 }}>{g.name}</h2>{g.status !== 'live' && <span className="pill warn">Coming soon</span>}</div>
              {g.list.map((b) => {
                const d = latest?.find((r) => r.business_id === b.id);
                if (g.kind === 'school') {
                  const sm = schoolMonths?.find((r) => r.business_id === b.id);
                  return (
                    <div key={b.id} style={{ padding: 14, border: '1px solid #ede6d3', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <strong>{b.name}</strong>
                      <span className="small muted num">{sm ? <><strong style={{ color: 'var(--text)' }}>{new Date(`${sm.month.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong>: revenue <strong style={{ color: 'var(--green)', fontSize: 15 }}>{usd0(sm.revenue)}</strong> · operating income {usd0(sm.operating_income)}</> : 'Monthly reports appear here once loaded.'}</span>
                      <div className="row"><a className="btn secondary" href={`/goddard/${b.id}`} style={{ textDecoration: 'none', minHeight: 38, padding: '6px 12px' }}>School report</a></div>
                    </div>
                  );
                }
                return (
                  <div key={b.id} style={{ padding: 14, border: '1px solid #ede6d3', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <strong>{b.name}</strong>
                    {self?.can_see_sales && <span className="small muted num">{d ? <><strong style={{ color: 'var(--text)' }}>{longDate(d.business_date)}</strong>: sales <strong style={{ color: 'var(--green)', fontSize: 15 }}>{money(d.total_sales)}</strong> · profit {d.profit_pct != null ? `${d.profit_pct}%` : "—"}</> : 'Reports appear here once data is in.'}</span>}
                    {self?.can_see_cash && (() => {
                      const c = cash?.find((r) => r.business_id === b.id);
                      return <span className="small muted num">{c ? <><strong style={{ color: 'var(--text)' }}>{longDate(c.business_date)}</strong>: cash deposited <strong style={{ color: 'var(--text)' }}>{money(c.deposit_amount)}</strong>{c.difference != null ? <> · {Number(c.difference) === 0 ? 'matched' : Number(c.difference) < 0 ? 'short' : 'over'} {signedMoney(c.difference)}</> : null}</> : 'No cash close-out yet.'}</span>;
                    })()}
                    {self?.can_see_owners && (() => {
                      const q = qb?.find((r) => r.business_id === b.id);
                      return <span className="small muted num">{q ? <>QuickBooks balance <strong style={{ color: 'var(--text)' }}>{money(q.qb_balance)}</strong> · as of {longDate(q.business_date)}</> : 'QuickBooks balance not entered yet.'}</span>;
                    })()}
                    <div className="row">
                      {self?.can_see_sales && <a className="btn secondary" href="/dashboard" style={{ textDecoration: 'none', minHeight: 38, padding: '6px 12px' }}>Sales dashboard</a>}
                      {self?.can_see_owners && <a className="btn secondary" href={`/owners?store=${b.id}`} style={{ textDecoration: 'none', minHeight: 38, padding: '6px 12px' }}>Owners Report</a>}
                    </div>
                  </div>
                );
              })}
            </section>
          ))}
        </div>
        <p className="small muted">Questions about a number? Contact OneSpeed Management. This view is read only.</p>
      </main>
    </>
  );
}
