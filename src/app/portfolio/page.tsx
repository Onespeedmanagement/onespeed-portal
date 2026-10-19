import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { AdminNav } from '@/components/AdminNav';
import { longDate, money } from '@/lib/format';

export const dynamic = 'force-dynamic';

type Biz = { id: string; name: string; portfolio_id: string };

export default async function PortfolioPage() {
  const me = await requireRole('admin');
  const supabase = await supabaseServer();
  const [{ data: portfolios }, { data: businesses }, { data: latest }] = await Promise.all([
    supabase.from('portfolios').select('id, name, status').order('sort'),
    supabase.from('businesses').select('id, name, portfolio_id').eq('active', true).order('name'),
    supabase.from('pos_daily').select('business_id, business_date, total_sales, profit_pct, cash_sales, card_sales')
      .order('business_date', { ascending: false }).limit(200),
  ]);
  const lastFor = (id: string) => latest?.find((r) => r.business_id === id);
  const { data: schoolMonths } = await supabase.from('school_months').select('business_id, month, revenue, operating_income').order('month', { ascending: false }).limit(200);
  const schoolFor = (id: string) => schoolMonths?.find((r) => r.business_id === id);
  const usd0 = (n: number | null) => (n == null ? '—' : Number(n).toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }));

  return (
    <>
      <TopBar subtitle="Management Portal" who={`${me.email} · Admin`} />
      <AdminNav active="/portfolio" />
      <main className="page" style={{ maxWidth: 1300 }}>
        <div className="row between">
          <div>
            <div className="eyebrow">Your portfolio</div>
            <h1>Choose a business</h1>
          </div>
          <div className="row">
            <a className="btn secondary" href="/admin/stores" style={{ textDecoration: 'none' }}>Stores &amp; locations</a>
            <a className="btn secondary" href="/admin/upload" style={{ textDecoration: 'none' }}>Upload POS reports</a>
          </div>
        </div>
        <div style={{ display: 'grid', gap: 20, gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 360px), 1fr))', alignItems: 'start' }}>
          {(portfolios ?? []).map((p) => {
            const list = (businesses ?? []).filter((b: Biz) => b.portfolio_id === p.id);
            return (
              <section key={p.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12, borderTop: `4px solid ${p.status === 'live' ? 'var(--green)' : 'var(--gold)'}` }}>
                <div className="row between">
                  <h2 style={{ fontSize: 30 }}>{p.name}</h2>
                  <span className={`pill ${p.status === 'live' ? 'good' : 'warn'}`}>{p.status === 'live' ? 'Live' : 'Coming soon'}</span>
                </div>
                {list.length === 0 && (/goddard/i.test(p.name)
                  ? <span className="small muted"><Link href="/goddard/upload">Upload a school’s FMS Monthly Financial Report</Link> to add it.</span>
                  : <span className="small muted">Locations will be added here.</span>)}
                {/goddard/i.test(p.name) && list.length > 0 && <Link href="/goddard" className="small">Open Goddard dashboard →</Link>}
                {list.map((b: Biz) => {
                  const d = lastFor(b.id);
                  const sm = schoolFor(b.id);
                  if (!d && (sm || /goddard/i.test(p.name))) return (
                    <a key={b.id} href={`/goddard/${b.id}`} style={{ padding: 14, border: '1px solid #ede6d3', borderRadius: 10, textDecoration: 'none', color: 'inherit' }}>
                      <strong>{b.name}</strong>
                      <div className="small muted num">{sm ? <><strong style={{ color: 'var(--text)' }}>{new Date(`${sm.month.slice(0, 7)}-15T12:00:00Z`).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })}</strong>: revenue <strong style={{ color: 'var(--green)', fontSize: 15 }}>{usd0(sm.revenue)}</strong> · operating income {usd0(sm.operating_income)}</> : 'Waiting for the first monthly report'}</div>
                    </a>
                  );
                  return (
                    <div key={b.id} style={{ padding: 14, border: '1px solid #ede6d3', borderRadius: 10 }}>
                      <strong>{b.name}</strong>
                      <div className="small muted num">
                        {d ? <><strong style={{ color: 'var(--text)' }}>{longDate(d.business_date)}</strong>: sales <strong style={{ color: 'var(--green)', fontSize: 15 }}>{money(d.total_sales)}</strong> · profit {d.profit_pct != null ? `${d.profit_pct}%` : "—"} · cash {money(d.cash_sales)}</>
                           : 'Waiting for the first POS report'}
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
      </main>
    </>
  );
}
