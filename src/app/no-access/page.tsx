import { supabaseServer } from '@/lib/supabase/server';

export default async function NoAccess() {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  return (
    <main className="page" style={{ maxWidth: 560, paddingTop: 80 }}>
      <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h1 style={{ fontSize: 32 }}>No access yet</h1>
        <p style={{ margin: 0 }}>
          {user?.email ? <><strong>{user.email}</strong> isn&apos;t on the portal&apos;s list.</> : 'This account isn’t on the portal’s list.'}{' '}
          Ask an admin at One Speed Management to add you.
        </p>
        <form action="/auth/signout" method="post">
          <button className="btn secondary" type="submit">Sign out and try another account</button>
        </form>
      </div>
    </main>
  );
}
