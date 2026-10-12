import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { longDate, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

export default async function InvestmentsPage() {
  const me = await requireRole('investor');
  const supabase = await supabaseServer();
  const [{ data: self }, { data: biz }, { data: portfolios }] = await Promise.all([
    supabase.from('app_users').select('display_name, can_see_sales, can_see_owners').eq('email', me.email).single(),
    supabase.from('businesses').select('id, name, portfolio_id').eq('active', true).order('name'),
    supabase.from('portfolios').select('id, name, status').order('sort'),
  ]);
  const { data: latest } = self?.can_see_sales
    ? await supabase.from('pos_daily').select('business_id, business_date, total_sales, profit_pct').order('business_date', { ascending: false }).limit(100)
    : { data: [] };
  const groups = (portfolios ?? []).map((p) => ({ ...p, list: (biz ?? []).filter((b) => b.portfolio_id === p.id) })).filter((g) => g.list.length);

  return (
    <>
      <TopBar subtitle="Investor Portal" who={`${me.email} · Investor · View only`} />
      <main className="page">
        <div>
          <div className="eyebrow">Welcome{self?.display_name ? `, ${self.display_name}` : ''}</div>
          <h1>Your investments</h1>
          <span className="small muted">You see only the businesses One Speed has shared with you.</span>
        </div>
        {groups.length === 0 && <div className="notice warn">Nothing has been shared with you yet. Contact One Speed Management.</div>}
        <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', alignItems: 'start' }}>
          {groups.map((g) => (
            <section key={g.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: `4px solid ${g.status === 'live' ? 'var(--green)' : 'var(--gold)'}` }}>
              <div className="row between"><h2 style={{ fontSize: 28 }}>{g.name}</h2>{g.status !== 'live' && <span className="pill warn">Coming soon</span>}</div>
              {g.list.map((b) => {
                const d = latest?.find((r) => r.business_id === b.id);
                return (
                  <div key={b.id} style={{ padding: 14, border: '1px solid #ede6d3', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <strong>{b.name}</strong>
                    {self?.can_see_sales && <span className="small muted num">{d ? `${longDate(d.business_date)}: sales ${money(d.total_sales)} · profit ${d.profit_pct}%` : 'Reports appear here once data is in.'}</span>}
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
        <p className="small muted">Questions about a number? Contact One Speed Management. This view is read only.</p>
      </main>
    </>
  );
}
