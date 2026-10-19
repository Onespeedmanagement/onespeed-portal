import { requireRole, homeFor, type Role } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { AdminNav } from '@/components/AdminNav';
import { longDate, money, signedMoney } from '@/lib/format';
import { startViewAs } from '@/app/view-as/actions';

export const dynamic = 'force-dynamic';

type Row = { page: string; ok: boolean; what: string };

const HOME_LABEL: Record<Role, string> = {
  admin: 'Portfolio', bookkeeper: 'Bookkeeper · Daily entries', manager: 'Close-out', investor: 'Your investments',
};

function pagesFor(role: Role, u: { can_see_sales: boolean; can_see_owners: boolean; can_see_cash: boolean }, stores: string): Row[] {
  const no = (page: string): Row => ({ page, ok: false, what: '' });
  switch (role) {
    case 'admin':
      return [{ page: 'Everything', ok: true, what: 'All stores, all pages, users, contracts and settings. Can change anything.' }];
    case 'bookkeeper':
      return [
        { page: 'Daily entries', ok: true, what: 'All stores. Marks each day as entered in QuickBooks; sees sales, cash and close-out differences.' },
        { page: 'Owners Report entry', ok: true, what: 'All stores. Uploads the QuickBooks register (balance + outstanding checks) and enters payments.' },
        { page: 'Upload POS reports', ok: true, what: 'All stores, past days. Can save a report that doesn’t add up (“save anyway”).' },
        { page: 'Edit sales / cash', ok: true, what: 'Can change a day’s sales or cash count with a reason. Every change shows up in Discrepancies and the morning email.' },
        no('Portfolio'), no('Dashboard'), no('Owners Report (owners’ view)'), no('Cash & deposits'), no('Discrepancies'), no('Users & employees'), no('Stores'), no('Contracts'),
      ];
    case 'manager':
      return [
        { page: 'Close-out', ok: true, what: `${stores || 'No store assigned'}. Enters today’s cash count (yesterday until 6 AM) and uploads that day’s POS report.` },
        { page: 'Missing POS reports', ok: true, what: 'Can upload reports for past days that are missing, back to Oct 1 (open until Oct 31). Each day only once, no replacing.' },
        { page: 'Employee list', ok: true, what: 'Adds or removes employees for their own store’s close-out.' },
        no('Sales dashboard'), no('Other stores'), no('Owners Report / QuickBooks'), no('Past close-outs after the day closes'),
      ];
    case 'investor':
      return [
        { page: 'Your investments', ok: true, what: `${stores || 'No store shared'}. Read only.` },
        { page: 'Latest sales', ok: u.can_see_sales, what: u.can_see_sales ? 'Yesterday’s sales and profit % per store.' : '' },
        { page: 'Sales dashboard', ok: u.can_see_sales, what: u.can_see_sales ? 'Revenue, customers, avg ticket, margin with YOY/MOM, for their stores only.' : '' },
        { page: 'Cash', ok: u.can_see_cash, what: u.can_see_cash ? 'Latest cash deposited and whether it was matched, short or over.' : '' },
        { page: 'Owners Report', ok: u.can_see_owners, what: u.can_see_owners ? 'QuickBooks balance, outstanding checks, payments and distributor checks, by day.' : '' },
        no('Portfolio'), no('Discrepancies'), no('Users & employees'), no('Contracts'), no('Editing anything'),
      ];
  }
}

export default async function ViewAccessPage({ searchParams }: { searchParams: Promise<{ email?: string }> }) {
  const me = await requireRole('admin');
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const { data: u } = await supabase.from('app_users').select('*').eq('email', String(sp.email ?? '')).maybeSingle();
  const { data: access } = u ? await supabase.from('business_access').select('business_id, businesses(name)').eq('email', u.email) : { data: [] };
  type Acc = { business_id: string; businesses: { name: string } | null };
  const mine = (access ?? []) as unknown as Acc[];
  const ids = mine.map((a) => a.business_id);
  const stores = mine.map((a) => a.businesses?.name ?? '').filter(Boolean).join(', ');

  // What the investor's first page shows right now
  const preview = u?.role === 'investor' && ids.length
    ? await Promise.all([
        u.can_see_sales ? supabase.from('pos_daily').select('business_id, business_date, total_sales, profit_pct').in('business_id', ids).order('business_date', { ascending: false }).limit(60) : { data: [] },
        u.can_see_cash ? supabase.from('closeout_results').select('business_id, business_date, deposit_amount, difference').in('business_id', ids).order('business_date', { ascending: false }).limit(60) : { data: [] },
        u.can_see_owners ? supabase.from('owners_report').select('business_id, business_date, qb_balance').in('business_id', ids).order('business_date', { ascending: false }).limit(60) : { data: [] },
      ])
    : null;

  return (
    <>
      <TopBar subtitle="Management Portal" who={`${me.email} · Admin`} />
      <AdminNav active="/admin/users" />
      <main className="page" style={{ maxWidth: 1000 }}>
        <div>
          <a href="/admin/users" className="small">← Users &amp; employees</a>
          <div className="eyebrow" style={{ marginTop: 8 }}>What this person can see</div>
          <h1>{u ? (u.display_name || u.email) : 'User not found'}</h1>
          {u && <span className="small muted">{u.email} · {u.role} · {u.active ? 'active' : 'turned off (can’t sign in)'}</span>}
          {u && u.role !== 'admin' && u.active && (
            <form action={startViewAs} style={{ marginTop: 10 }}>
              <input type="hidden" name="email" value={u.email} />
              <button className="btn" type="submit">👁 See the portal as they see it</button>
            </form>
          )}
        </div>

        {u && (
          <>
            <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <div><span className="muted small">Lands on</span> <strong>{HOME_LABEL[u.role as Role]}</strong> <span className="small muted">({homeFor(u.role as Role)})</span></div>
              <div><span className="muted small">Stores</span> <strong>{u.role === 'admin' || u.role === 'bookkeeper' ? 'All stores' : stores || 'None'}</strong></div>
              {u.role === 'investor' && (
                <div className="row" style={{ gap: 6 }}>
                  {(['sales', 'owners', 'cash'] as const).map((k) => (
                    <span key={k} className={`pill ${u[`can_see_${k}`] ? 'good' : 'warn'}`}>{u[`can_see_${k}`] ? '✓' : '✕'} {k === 'owners' ? 'Owners Report' : k[0].toUpperCase() + k.slice(1)}</span>
                  ))}
                </div>
              )}
            </section>

            <section className="card scroll">
              <h2 style={{ marginBottom: 10 }}>Pages and what’s on them</h2>
              <table style={{ minWidth: 560 }}>
                <thead><tr><th>Page</th><th>Access</th><th>What they see / can do</th></tr></thead>
                <tbody>
                  {pagesFor(u.role as Role, u, stores).map((r) => (
                    <tr key={r.page} style={{ opacity: r.ok ? 1 : 0.6 }}>
                      <td><strong>{r.page}</strong></td>
                      <td>{r.ok ? <span className="pill good">✓ Yes</span> : <span className="pill bad">✕ No</span>}</td>
                      <td className="small">{r.what || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            {preview && (
              <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                <h2>Their first page right now</h2>
                {mine.map((a) => {
                  const d = preview[0].data?.find((r) => r.business_id === a.business_id);
                  const c = preview[1].data?.find((r) => r.business_id === a.business_id);
                  const q = preview[2].data?.find((r) => r.business_id === a.business_id);
                  return (
                    <div key={a.business_id} style={{ padding: 14, border: '1px solid #ede6d3', borderRadius: 10, display: 'flex', flexDirection: 'column', gap: 6 }}>
                      <strong>{a.businesses?.name}</strong>
                      {u.can_see_sales && <span className="small muted num">{d ? <><strong style={{ color: 'var(--text)' }}>{longDate(d.business_date)}</strong>: sales <strong style={{ color: 'var(--green)' }}>{money(d.total_sales)}</strong> · profit {d.profit_pct != null ? `${d.profit_pct}%` : "—"}</> : 'No sales yet.'}</span>}
                      {u.can_see_cash && <span className="small muted num">{c ? <><strong style={{ color: 'var(--text)' }}>{longDate(c.business_date)}</strong>: cash deposited {money(c.deposit_amount)}{c.difference != null ? ` · ${signedMoney(c.difference)}` : ''}</> : 'No cash close-out yet.'}</span>}
                      {u.can_see_owners && <span className="small muted num">{q ? <>QuickBooks balance {money(q.qb_balance)} · as of {longDate(q.business_date)}</> : 'QuickBooks balance not entered yet.'}</span>}
                    </div>
                  );
                })}
              </section>
            )}

            <div className="row">
              {u.role !== 'admin' && u.active && (
                <form action={startViewAs}>
                  <input type="hidden" name="email" value={u.email} />
                  <button className="btn" type="submit">👁 View as {u.display_name || u.email}</button>
                </form>
              )}
              <a href={`/admin/users?edit=${encodeURIComponent(u.email)}`} className="btn secondary" style={{ textDecoration: 'none' }}>Change their access</a>
            </div>
          </>
        )}
      </main>
    </>
  );
}
