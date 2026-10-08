import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
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

  return (
    <>
      <TopBar subtitle="Management Portal" who={`${me.email} · Admin`} />
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
                {list.length === 0 && <span className="small muted">Locations will be added here.</span>}
                {list.map((b: Biz) => {
                  const d = lastFor(b.id);
                  return (
                    <div key={b.id} style={{ padding: 14, border: '1px solid #ede6d3', borderRadius: 10 }}>
                      <strong>{b.name}</strong>
                      <div className="small muted num">
                        {d ? `${longDate(d.business_date)}: sales ${money(d.total_sales)} · profit ${d.profit_pct}% · cash ${money(d.cash_sales)}`
                           : 'Waiting for the first POS report'}
                      </div>
                    </div>
                  );
                })}
              </section>
            );
          })}
        </div>
        <p className="small muted">Dashboard, Daily view, Owners Report and Discrepancies are being built next.</p>
      </main>
    </>
  );
}
