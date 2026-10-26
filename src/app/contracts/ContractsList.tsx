import Link from 'next/link';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { AdminNav } from '@/components/AdminNav';
import { RoleNav } from '@/components/RoleNav';
import { contractScope } from '@/lib/contractScope';
import type { Me } from '@/lib/auth';
import { todayNY } from '@/lib/dates';
import { money } from '@/lib/format';
import { currentTerm, urgency, type Contract, type Urgency } from '@/lib/contracts';
import { ContractForm } from './ContractForm';


const PILL: Record<Urgency, [string, string]> = {
  past: ['bad', 'Notice date passed'], soon: ['bad', 'Notice due soon'], upcoming: ['warn', 'Coming up'], later: ['good', 'OK'], ended: ['', 'Ended'],
};
const nice = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export async function ContractsList({ me, school, sp }: { me: Me; school: boolean; sp: { show?: string; add?: string; vendor?: string; category?: string; store?: string } }) {
  const supabase = await supabaseServer();
  const today = todayNY();
  const scope = await contractScope(supabase, school);
  const { businesses, base } = scope;
  const [{ data: rows }, { data: files }] = await Promise.all([
    scope.portfolioIds.length ? supabase.from('contracts').select('*').in('portfolio_id', scope.portfolioIds) : Promise.resolve({ data: [] }),
    supabase.from('contract_files').select('contract_id'),
  ]);
  const contracts = ((rows ?? []) as Contract[]).map((c) => ({ ...c, cost: c.cost == null ? null : Number(c.cost) }));
  const showAll = sp.show === 'all';
  const list = contracts
    .filter((c) => showAll || c.status === 'active')
    .map((c) => ({ c, t: currentTerm(c, today), u: urgency(c, today) }))
    .sort((a, b) => (a.u === 'ended' ? 1 : 0) - (b.u === 'ended' ? 1 : 0) || a.t.notice.localeCompare(b.t.notice));
  const bizName = (id: string | null) => (id ? businesses.find((b) => b.id === id)?.name ?? '—' : school ? 'All schools' : 'Company-wide');
  const fileCount = (id: string) => (files ?? []).filter((f) => f.contract_id === id).length;
  const soon = list.filter((x) => x.u === 'soon' || x.u === 'past').length;

  return (
    <>
      <TopBar subtitle="Management Portal" who={`${me.email} · ${me.role === 'admin' ? 'Admin' : 'Goddard admin'}`} />
      {school ? <RoleNav role={me.role} active="/goddard/contracts" /> : <AdminNav active="/contracts" />}
      <main className="page" style={{ maxWidth: 1300 }}>
        <div className="row between">
          <div>
            <h1>{school ? 'Goddard contracts' : 'Contracts & renewals'}</h1>
            <span className="small muted">{school ? 'Leases, franchise agreement, insurance, food service and other school contracts.' : 'Insurance, leases, trash and other contracts.'} Reminder emails go out 30 and 7 days before each notice deadline.</span>
          </div>
          <div className="row">
            <Link className="btn secondary" style={{ textDecoration: 'none' }} href={showAll ? base : `${base}?show=all`}>{showAll ? 'Active only' : 'Show cancelled / ended'}</Link>
            <Link className="btn" style={{ textDecoration: 'none' }} href={`${base}?add=1#add`}>+ Add contract</Link>
          </div>
        </div>

        {soon > 0 && <div className="notice bad">{soon} contract{soon > 1 ? 's need' : ' needs'} a decision: the notice deadline is within 30 days or has passed.</div>}

        <section className="card scroll">
          {list.length === 0 ? <p className="muted">No contracts yet. Add your first one below.</p> : (
            <table className="num" style={{ minWidth: 980 }}>
              <thead><tr><th>Status</th><th>Type</th><th>Vendor</th><th>For</th><th>Notice deadline</th><th>Term ends</th><th>Renews</th><th className="r">Cost</th><th>File</th></tr></thead>
              <tbody>
                {list.map(({ c, t, u }) => (
                  <tr key={c.id}>
                    <td><span className={`pill ${PILL[u][0]}`}>{c.status !== 'active' ? (c.status === 'cancelled' ? 'Cancelled' : 'Ended') : PILL[u][1]}</span></td>
                    <td>{c.category}</td>
                    <td><Link href={`/contracts/${c.id}`}><strong>{c.vendor}</strong></Link>{c.description && <div className="small muted">{c.description}</div>}</td>
                    <td className="small">{bizName(c.business_id)}</td>
                    <td><strong>{nice(t.notice)}</strong><div className="small muted">{u === 'ended' ? '' : t.daysToNotice < 0 ? `${-t.daysToNotice} days ago` : t.daysToNotice === 0 ? 'today' : `in ${t.daysToNotice} days`}</div></td>
                    <td>{nice(t.end)}{t.rolled > 0 && <div className="small muted">auto-renewed</div>}</td>
                    <td className="small">{c.auto_renews ? `Auto, ${c.renewal_months} mo` : 'No'}</td>
                    <td className="r small">{c.cost != null ? `${money(c.cost)}${c.cost_period && c.cost_period !== 'one-time' ? ` / ${c.cost_period}` : ''}` : '—'}</td>
                    <td className="small">{fileCount(c.id) ? `📎 ${fileCount(c.id)}` : <span className="muted">none</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        {(sp.add || list.length === 0) && (
          <section id="add" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <h2>Add a contract</h2>
            <ContractForm businesses={businesses} admins={scope.people} defaultRemind={[me.email]} portfolioId={scope.defaultPortfolio} allLabel={scope.allLabel}
              prefill={{ vendor: sp.vendor, category: sp.category, business_id: sp.store }} />
          </section>
        )}
      </main>
    </>
  );
}
