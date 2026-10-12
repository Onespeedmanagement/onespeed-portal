import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { longDate, money, signedMoney } from '@/lib/format';
import { CloseoutForm } from './CloseoutForm';
import { EmployeeManager } from './EmployeeManager';
import { UploadToday } from './UploadToday';

export const dynamic = 'force-dynamic';

const shortDate = (iso: string) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
};

// Store manager screen: their store; yesterday's close-out, plus catch-up days not yet submitted.
export default async function CloseoutPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const { date: wanted } = await searchParams;
  const me = await requireRole('manager');
  const supabase = await supabaseServer();

  const { data: stores } = await supabase.from('businesses').select('id, name').eq('active', true).order('name');
  const store = stores?.[0];
  if (!store) {
    return (<><TopBar who={me.email} /><main className="page"><div className="notice warn">You aren&apos;t assigned to a store yet. Ask an admin.</div></main></>);
  }

  const { data: openRows } = await supabase.rpc('manager_open_dates', { b: store.id });
  const openDates = ((openRows ?? []) as unknown[]).map((r) => String(typeof r === 'object' && r ? Object.values(r)[0] : r));
  const { data: submittedRows } = openDates.length
    ? await supabase.from('closeouts').select('business_date').eq('business_id', store.id).in('business_date', openDates)
    : { data: [] as { business_date: string }[] };
  const submitted = new Set((submittedRows ?? []).map((r) => r.business_date));
  const pending = openDates.filter((d) => !submitted.has(d));
  const yesterday = openDates[openDates.length - 1];
  const day = wanted && openDates.includes(wanted) ? wanted : (pending[0] ?? yesterday);
  if (!day) {
    return (<><TopBar subtitle={store.name} who={`${me.email} · Store manager`} /><main className="page"><div className="notice good">You&apos;re all caught up.</div></main></>);
  }

  const [{ data: pos }, { data: done }, { data: employees }, { data: tol }] = await Promise.all([
    supabase.from('pos_daily').select('cash_sales, card_sales, total_sales').eq('business_id', store.id).eq('business_date', day).maybeSingle(),
    supabase.from('closeout_results').select('cash_counted, paid_out, paid_out_reason, petty_change, held_for_next, difference, deposit_amount, submitted_by, submitted_at')
      .eq('business_id', store.id).eq('business_date', day).maybeSingle(),
    supabase.from('employees').select('id, name').eq('business_id', store.id).eq('active', true).order('name'),
    supabase.from('settings').select('value').eq('key', 'match_tolerance').maybeSingle(),
  ]);
  const tolerance = Number(tol?.value ?? 1);

  return (
    <>
      <TopBar subtitle={store.name} who={`${me.email} · Store manager`} />
      <main className="page" style={{ maxWidth: 880 }}>
        <div>
          <div className="eyebrow">{day === yesterday ? 'Yesterday\u2019s close-out' : 'Catch-up close-out'}</div>
          <h1>{longDate(day)}</h1>
          <span className="small muted">Enter the day after, once that day&apos;s POS report is printed. Days you haven&apos;t submitted stay open for {openDates.length} days.</span>
        </div>

        {pending.length > 0 && (
          <nav aria-label="Days to close out" className="row">
            {openDates.map((d) => (
              <a key={d} href={`/closeout?date=${d}`} className={`pill ${d === day ? 'good' : submitted.has(d) ? '' : 'warn'}`}
                 style={{ textDecoration: 'none', border: d === day ? '2px solid var(--green)' : '1px solid var(--line)', padding: '8px 14px' }}>
                {shortDate(d)}{submitted.has(d) ? ' · done' : ' · to do'}
              </a>
            ))}
          </nav>
        )}

        <div className="grid num">
          <div className="stat"><span className="small muted">Cash · from POS (net cash-flow)</span><strong>{pos ? money(pos.cash_sales) : 'Not in yet'}</strong></div>
          <div className="stat"><span className="small muted">Card · from POS</span><strong>{pos ? money(pos.card_sales) : 'Not in yet'}</strong></div>
        </div>

        {!done && <UploadToday hasReport={!!pos} businessDate={day} label={shortDate(day)} />}

        {done ? (
          <section className="card num" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="row between"><h2>Submitted</h2>
              {done.difference == null || pos == null ? <span className="pill warn">Waiting for POS report</span>
                : Math.abs(done.difference) <= tolerance ? <span className="pill good">✓ Matched</span>
                : done.difference < 0 ? <span className="pill bad">✕ Short {signedMoney(done.difference)}</span>
                : <span className="pill warn">▲ Over {signedMoney(done.difference)}</span>}
            </div>
            <table><tbody>
              <tr><td>Cash counted</td><td className="r">{money(done.cash_counted)}</td></tr>
              <tr><td>Cash paid out{done.paid_out_reason ? ` · ${done.paid_out_reason}` : ''}</td><td className="r">{money(done.paid_out)}</td></tr>
              <tr><td>Petty change taken</td><td className="r">{money(done.petty_change)}</td></tr>
              <tr><td>Held for next deposit</td><td className="r">{money(done.held_for_next)}</td></tr>
              <tr><td><strong>Deposit</strong></td><td className="r"><strong>{money(done.deposit_amount)}</strong></td></tr>
            </tbody></table>
            <span className="small muted">Submitted by {done.submitted_by}. This day is locked; only an admin can change it.</span>
          </section>
        ) : (
          <CloseoutForm businessId={store.id} businessDate={day} cashSales={pos?.cash_sales ?? null}
            tolerance={tolerance} employees={employees ?? []} />
        )}

        <EmployeeManager businessId={store.id} employees={employees ?? []} />
      </main>
    </>
  );
}
