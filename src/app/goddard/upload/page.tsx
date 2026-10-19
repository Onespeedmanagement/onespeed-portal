import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { RoleNav } from '@/components/RoleNav';
import { loadSchools, monthName } from '@/lib/goddard/schools';
import { FmsUpload } from './FmsUpload';

export const dynamic = 'force-dynamic';

export default async function GoddardUploadPage() {
  const me = await requireRole('admin', 'school_bookkeeper');
  const supabase = await supabaseServer();
  const { schools } = await loadSchools(supabase);
  const { data: months } = await supabase.from('school_months').select('business_id, month').order('month', { ascending: false }).limit(500);
  return (
    <>
      <TopBar subtitle="Goddard Schools" who={`${me.email} · ${me.role === 'admin' ? 'Admin' : 'Goddard bookkeeper'}`} />
      <RoleNav role={me.role} active={me.role === 'admin' ? '/goddard' : '/goddard/upload'} />
      <main className="page">
        <div>
          <Link href="/goddard" className="small">← Goddard Schools</Link>
          <div className="eyebrow" style={{ marginTop: 8 }}>Monthly</div>
          <h1>Upload school financials</h1>
        </div>
        <FmsUpload isAdmin={me.role === 'admin'} />
        <section className="card">
          <h2 style={{ marginBottom: 8 }}>Loaded so far</h2>
          {schools.length === 0 ? <p className="muted">No schools yet. Upload a report and add the school from the result.</p> : schools.map((s) => {
            const ms = (months ?? []).filter((m) => m.business_id === s.id).map((m) => m.month);
            return (
              <div key={s.id} className="row between" style={{ padding: '8px 0', borderBottom: '1px solid var(--line-soft)' }}>
                <a href={`/goddard/${s.id}`}><strong>{s.name}</strong></a>
                <span className="small muted">{ms.length ? `${ms.length} month${ms.length === 1 ? '' : 's'} · ${monthName(ms[ms.length - 1], 'short')} – ${monthName(ms[0], 'short')}` : 'Nothing yet'}</span>
              </div>
            );
          })}
          <p className="small muted" style={{ marginTop: 10 }}>Forecasted billing, new enrollments, A/R ledger and deposit history are uploaded on each school’s page.</p>
        </section>
      </main>
    </>
  );
}
