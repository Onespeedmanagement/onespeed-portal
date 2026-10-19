import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { AdminNav } from '@/components/AdminNav';
import { UserForm } from './UserForm';
import { employeeAction, setActive } from './actions';

export const dynamic = 'force-dynamic';

const ROLE: Record<string, [string, string]> = {
  admin: ['Admin', 'var(--green)'], bookkeeper: ['Bookkeeper', '#3b6450'], manager: ['Store manager', '#8a6a1e'], investor: ['Investor', '#2b3e66'],
};

export default async function UsersPage({ searchParams }: { searchParams: Promise<{ edit?: string; saved?: string; emp_store?: string }> }) {
  const me = await requireRole('admin');
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const [{ data: users }, { data: access }, { data: biz }, { data: portfolios }] = await Promise.all([
    supabase.from('app_users').select('*').order('role').order('email'),
    supabase.from('business_access').select('email, business_id'),
    supabase.from('businesses').select('id, name, portfolio_id, active').order('name'),
    supabase.from('portfolios').select('id, name, sort').order('sort'),
  ]);
  const businesses = (biz ?? []).filter((b) => b.active).map((b) => ({ id: b.id, name: b.name, portfolio: portfolios?.find((p) => p.id === b.portfolio_id)?.name ?? '' }));
  const bizName = (id: string) => biz?.find((b) => b.id === id)?.name ?? '';
  const editing = users?.find((u) => u.email === sp.edit) ?? null;
  const empStore = biz?.find((b) => b.id === sp.emp_store) ?? biz?.find((b) => b.active);
  const { data: employees } = empStore
    ? await supabase.from('employees').select('id, name, active, created_at').eq('business_id', empStore.id).order('active', { ascending: false }).order('name')
    : { data: [] };

  return (
    <>
      <TopBar subtitle="Management Portal" who={`${me.email} · Admin`} />
      <AdminNav active="/admin/users" />
      <main className="page" style={{ maxWidth: 1240 }}>
        <div>
          <div className="eyebrow">Admins only</div>
          <h1>Users &amp; employees</h1>
        </div>
        {sp.saved && <div className="notice good">✓ Saved {sp.saved}.</div>}

        <section className="card scroll">
          <h2 style={{ marginBottom: 10 }}>Who can sign in</h2>
          <table style={{ minWidth: 860 }}>
            <thead><tr><th>Email</th><th>Role</th><th>Access</th><th>Status</th><th /></tr></thead>
            <tbody>
              {(users ?? []).map((u) => {
                const mine = (access ?? []).filter((a) => a.email === u.email).map((a) => bizName(a.business_id));
                return (
                  <tr key={u.email} style={{ opacity: u.active ? 1 : 0.55 }}>
                    <td><strong>{u.email}</strong>{u.display_name ? <div className="small muted">{u.display_name}</div> : null}</td>
                    <td><span className="pill" style={{ background: ROLE[u.role][1], color: '#fff' }}>{ROLE[u.role][0]}</span></td>
                    <td className="small">{u.role === 'admin' ? 'Everything' : u.role === 'bookkeeper' ? 'All stores · daily entries, Owners Report entry'
                      : mine.join(', ') || '—'}
                      {u.role === 'investor' && <div className="muted">{[u.can_see_sales && 'sales', u.can_see_owners && 'owners report', u.can_see_cash && 'cash'].filter(Boolean).join(' · ') || 'nothing selected'}</div>}</td>
                    <td>{u.active ? <span className="pill good">Active</span> : <span className="pill warn">Off</span>}</td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      <a href={`/admin/users/view?email=${encodeURIComponent(u.email)}`} className="btn secondary" style={{ textDecoration: 'none', minHeight: 36, padding: '6px 12px' }}>View</a>{' '}
                      <a href={`/admin/users?edit=${encodeURIComponent(u.email)}`} className="btn secondary" style={{ textDecoration: 'none', minHeight: 36, padding: '6px 12px' }}>Edit</a>{' '}
                      {u.email !== me.email && (
                        <form action={setActive} style={{ display: 'inline' }}>
                          <input type="hidden" name="email" value={u.email} /><input type="hidden" name="active" value={String(!u.active)} />
                          <button className="btn secondary" type="submit" style={{ minHeight: 36, padding: '6px 12px' }}>{u.active ? 'Turn off' : 'Turn on'}</button>
                        </form>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <UserForm key={editing?.email ?? 'new'} businesses={businesses} user={editing}
          access={editing ? (access ?? []).filter((a) => a.email === editing.email).map((a) => a.business_id) : []} />

        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div className="row between">
            <h2>Register employees</h2>
            <form method="get" className="row">
              <select name="emp_store" defaultValue={empStore?.id} aria-label="Store" style={{ width: 'auto' }}>
                {(biz ?? []).filter((b) => b.active).map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              <button className="btn secondary" type="submit">Show</button>
            </form>
          </div>
          <span className="small muted">These names appear in that store&apos;s close-out. Store managers can also manage their own list. Removing keeps their history.</span>
          {(employees ?? []).map((e) => (
            <div key={e.id} className="row between" style={{ padding: '8px 12px', border: '1px solid #ede6d3', borderRadius: 10, opacity: e.active ? 1 : 0.55 }}>
              <form action={employeeAction} className="row" style={{ flex: '1 1 300px' }}>
                <input type="hidden" name="op" value="rename" /><input type="hidden" name="id" value={e.id} /><input type="hidden" name="old_name" value={e.name} />
                <input type="text" name="name" defaultValue={e.name} aria-label="Employee name" style={{ flex: '1 1 200px', width: 'auto' }} />
                <button className="btn secondary" type="submit">Rename</button>
              </form>
              <form action={employeeAction}>
                <input type="hidden" name="op" value={e.active ? 'remove' : 'restore'} /><input type="hidden" name="id" value={e.id} /><input type="hidden" name="name" value={e.name} />
                <button className={`btn ${e.active ? 'danger' : 'secondary'}`} type="submit">{e.active ? 'Remove' : 'Restore'}</button>
              </form>
            </div>
          ))}
          {empStore && (
            <form action={employeeAction} className="row" style={{ alignItems: 'flex-end' }}>
              <input type="hidden" name="op" value="add" /><input type="hidden" name="business_id" value={empStore.id} />
              <div className="field" style={{ flex: '1 1 240px' }}><label htmlFor="emp_name">Add an employee to {empStore.name}</label>
                <input id="emp_name" name="name" type="text" placeholder="Name" /></div>
              <button className="btn" type="submit">Add</button>
            </form>
          )}
        </section>
      </main>
    </>
  );
}
