'use client';
import { useActionState, useState } from 'react';
import { saveUser, type FormState } from './actions';

type Biz = { id: string; name: string; portfolio: string };
type User = { email: string; display_name: string | null; role: string; can_see_sales: boolean; can_see_owners: boolean; can_see_cash: boolean } | null;

export function UserForm({ businesses, user, access }: { businesses: Biz[]; user: User; access: string[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveUser, {});
  const [role, setRole] = useState(user?.role ?? 'manager');
  const portfolios = [...new Set(businesses.map((b) => b.portfolio))];
  return (
    <form action={action} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2>{user ? `Edit ${user.email}` : 'Add a person'}</h2>
      <div className="grid">
        <div className="field"><label htmlFor="email">Google email they sign in with</label>
          <input id="email" name="email" type="email" defaultValue={user?.email} readOnly={!!user} placeholder="name@gmail.com" required /></div>
        <div className="field"><label htmlFor="display_name">Name (optional)</label>
          <input id="display_name" name="display_name" type="text" defaultValue={user?.display_name ?? ''} /></div>
        <div className="field"><label htmlFor="role">Role</label>
          <select id="role" name="role" value={role} onChange={(e) => setRole(e.target.value)}>
            <option value="manager">Store manager</option><option value="investor">Investor</option>
            <option value="bookkeeper">Bookkeeper (stores)</option><option value="school_bookkeeper">Goddard bookkeeper</option><option value="school_admin">Goddard admin</option><option value="admin">Admin (everything)</option>
          </select></div>
      </div>
      {(role === 'manager' || role === 'investor' || role === 'school_bookkeeper') && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 500, fontSize: 14, marginBottom: 6 }}>{role === 'manager' ? 'Store(s) they manage' : role === 'school_bookkeeper' ? 'School(s) they keep the books for' : 'Businesses they can see'}</legend>
          <div className="grid">
            {portfolios.filter((p) => role !== 'school_bookkeeper' || /goddard/i.test(p)).map((p) => (
              <div key={p}><strong className="small">{p}</strong>
                {businesses.filter((b) => b.portfolio === p).map((b) => (
                  <label key={b.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400, padding: '6px 0' }}>
                    <input type="checkbox" name="business_id" value={b.id} defaultChecked={access.includes(b.id)} style={{ width: 18, height: 18 }} />{b.name}
                  </label>
                ))}
              </div>
            ))}
          </div>
        </fieldset>
      )}
      {role === 'investor' && (
        <fieldset style={{ border: 0, padding: 0, margin: 0 }}>
          <legend style={{ fontWeight: 500, fontSize: 14, marginBottom: 6 }}>What they can see for those businesses</legend>
          <div className="row">
            <label style={{ fontWeight: 400, display: 'flex', gap: 8 }}><input type="checkbox" name="can_see_sales" defaultChecked={user?.can_see_sales ?? true} style={{ width: 18, height: 18 }} />Sales dashboard &amp; reports</label>
            <label style={{ fontWeight: 400, display: 'flex', gap: 8 }}><input type="checkbox" name="can_see_owners" defaultChecked={user?.can_see_owners ?? false} style={{ width: 18, height: 18 }} />Owners Report (bank &amp; payments)</label>
            <label style={{ fontWeight: 400, display: 'flex', gap: 8 }}><input type="checkbox" name="can_see_cash" defaultChecked={user?.can_see_cash ?? false} style={{ width: 18, height: 18 }} />Cash close-outs</label>
          </div>
        </fieldset>
      )}
      <div className="row">
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save'}</button>
        {user && <a href="/admin/users" className="btn secondary" style={{ textDecoration: 'none' }}>Cancel</a>}
      </div>
      {state.error && <div className="notice bad">{state.error}</div>}
      <span className="small muted">They sign in at the portal with &quot;Sign in with Google&quot; using this exact email. Changes take effect right away.</span>
    </form>
  );
}
