import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { AdminNav } from '@/components/AdminNav';
import { todayNY } from '@/lib/dates';
import { money } from '@/lib/format';
import { currentTerm, urgency, type Contract, type Urgency } from '@/lib/contracts';
import { ContractForm } from './ContractForm';

export const dynamic = 'force-dynamic';

const PILL: Record<Urgency, [string, string]> = {
  past: ['bad', 'Notice date passed'], soon: ['bad', 'Notice due soon'], upcoming: ['warn', 'Coming up'], later: ['good', 'OK'], ended: ['', 'Ended'],
};
const nice = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ show?: string; add?: string }> }) {
  const me = await requireRole('admin');
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const today = todayNY();
  const [{ data: rows }, { data: businesses }, { data: admins }, { data: files }] = await Promise.all([
    supabase.from('contracts').select('*'),
    supabase.from('businesses').select('id, name').eq('active', true).order('name'),
    supabase.from('app_users').select('email, display_name').eq('role', 'admin').eq('active', true).order('email'),
    supabase.from('contract_files').select('contract_id'),
  ]);
  const contracts = ((rows ?? []) as Contract[]).map((c) => ({ ...c, cost: c.cost == null ? null : Number(c.cost) }));
  const showAll = sp.show === 'all';
  const list = contracts
    .filter((c) => showAll || c.status === 'active')
    .map((c) => ({ c, t: currentTerm(c, today), u: urgency(c, today) }))
    .sort((a, b) => (a.u === 'ended' ? 1 : 0) - (b.u === 'ended' ? 1 : 0) || a.t.notice.localeCompare(b.t.notice));
  const bizName = (id: string | null) => (id ? businesses?.find((b) => b.id === id)?.name ?? '—' : 'Company-wide');
  const fileCount = (id: string) => (files ?? []).filter((f) => f.contract_id === id).length;
  const soon = list.filter((x) => x.u === 'soon' || x.u === 'past').length;
  const adminOpts = (admins ?? []).map((a) => ({ email: a.email, name: a.display_name || a.email.split('@')[0] }));

  return (
    <>
      <TopBar subtitle="Management Portal" who={`${me.email} · Admin`} />
      <AdminNav active="/contracts" />
      <main className="page" style={{ maxWidth: 1300 }}>
        <div className="row between">
          <div>
            <div className="eyebrow">Admins only</div>
            <h1>Contracts &amp; renewals</h1>
            <span className="small muted">Insurance, leases, trash and other contracts. Reminder emails go out 30 and 7 days before each notice deadline.</span>
          </div>
          <div className="row">
            <Link className="btn secondary" style={{ textDecoration: 'none' }} href={showAll ? '/contracts' : '/contracts?show=all'}>{showAll ? 'Active only' : 'Show cancelled / ended'}</Link>
            <Link className="btn" style={{ textDecoration: 'none' }} href="/contracts?add=1#add">+ Add contract</Link>
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
            <ContractForm businesses={businesses ?? []} admins={adminOpts} defaultRemind={[me.email]} />
          </section>
        )}
      </main>
    </>
  );
}
