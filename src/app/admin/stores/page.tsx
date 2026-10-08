import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { StoresEditor } from './StoresEditor';

export const dynamic = 'force-dynamic';

export default async function StoresPage() {
  const me = await requireRole('admin');
  const supabase = await supabaseServer();
  const [{ data: portfolios }, { data: stores }] = await Promise.all([
    supabase.from('portfolios').select('id, name').order('sort'),
    supabase.from('businesses').select('id, name, pos_match, active, portfolio_id').order('name'),
  ]);
  return (
    <>
      <TopBar subtitle="Stores & locations" who={`${me.email} · Admin`} />
      <main className="page">
        <div>
          <a href="/portfolio" className="small">← Portfolio</a>
          <div className="eyebrow" style={{ marginTop: 8 }}>Admins only</div>
          <h1>Stores &amp; locations</h1>
          <span className="small muted">Add a store, school or hotel, fix a name, or deactivate a location. Deactivating keeps its history.</span>
        </div>
        <StoresEditor portfolios={portfolios ?? []} stores={stores ?? []} />
      </main>
    </>
  );
}
