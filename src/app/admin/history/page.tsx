import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { AdminNav } from '@/components/AdminNav';
import { todayNY } from '@/lib/dates';
import { HistoryForm } from './HistoryForm';
import { MonthForm } from './MonthForm';

export const dynamic = 'force-dynamic';

const usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
const monthShort = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', year: '2-digit', timeZone: 'UTC' });

export default async function HistoryPage() {
  const me = await requireRole('admin');
  const supabase = await supabaseServer();
  const [{ data: stores }, { data: hist }] = await Promise.all([
    supabase.from('businesses').select('id, name').eq('active', true).order('name'),
    supabase.from('monthly_history').select('business_id, month, revenue, customers, profit_pct').order('month'),
  ]);
  const months = [...new Set((hist ?? []).map((h) => h.month))].sort();
  const cell = (b: string, m: string) => hist?.find((h) => h.business_id === b && h.month === m);

  return (
    <>
      <TopBar subtitle="Sales history" who={`${me.email} · Admin`} />
      <AdminNav active="/admin/upload" />
      <main className="page" style={{ maxWidth: 1360 }}>
        <div>
          <a href="/admin/upload" className="small">← Upload POS reports</a>
          <div className="eyebrow" style={{ marginTop: 8 }}>For year-over-year before the portal started</div>
          <h1>Monthly sales history</h1>
          <span className="small muted">Monthly revenue, customers and profit % per store. The dashboard uses these for any month the nightly POS reports don&apos;t fully cover; once a whole month of POS reports is in, those take over.</span>
        </div>
        <HistoryForm thisYear={Number(todayNY().slice(0, 4))} />
        <MonthForm stores={stores ?? []} />
        <section className="card scroll">
          <h2>Loaded so far</h2>
          {months.length === 0 ? <p className="muted">Nothing loaded yet.</p> : (
            <table className="num" style={{ minWidth: 300 + months.length * 80, marginTop: 8 }}>
              <thead><tr><th>Store</th>{months.map((m) => <th key={m} className="r">{monthShort(m)}</th>)}</tr></thead>
              <tbody>
                {(stores ?? []).map((s) => (
                  <tr key={s.id}>
                    <td style={{ whiteSpace: 'nowrap' }}>{s.name}</td>
                    {months.map((m) => {
                      const h = cell(s.id, m);
                      return <td key={m} className="r small" title={h ? `${h.customers ?? '—'} customers · ${h.profit_pct ?? '—'}% profit` : ''}>{h ? usd.format(Number(h.revenue)) : '—'}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      </main>
    </>
  );
}
