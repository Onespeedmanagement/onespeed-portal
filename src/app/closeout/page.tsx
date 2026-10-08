import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { longDate, money, signedMoney } from '@/lib/format';
import { CloseoutForm } from './CloseoutForm';
import { EmployeeManager } from './EmployeeManager';

export const dynamic = 'force-dynamic';

// Store manager screen: their store, today only.
export default async function CloseoutPage() {
  const me = await requireRole('manager');
  const supabase = await supabaseServer();

  const { data: stores } = await supabase.from('businesses').select('id, name').eq('active', true).order('name');
  const store = stores?.[0];
  if (!store) {
    return (<><TopBar who={me.email} /><main className="page"><div className="notice warn">You aren&apos;t assigned to a store yet. Ask an admin.</div></main></>);
  }

  const { data: openDate } = await supabase.rpc('manager_open_date', { b: store.id });
  const day = openDate as string;

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
          <div className="eyebrow">Today&apos;s close-out</div>
          <h1>{longDate(day)}</h1>
          <span className="small muted">You can see and enter today only, for your store.</span>
        </div>

        <div className="grid num">
          <div className="stat"><span className="small muted">Cash · from POS (net cash-flow)</span><strong>{pos ? money(pos.cash_sales) : 'Not in yet'}</strong></div>
          <div className="stat"><span className="small muted">Card · from POS</span><strong>{pos ? money(pos.card_sales) : 'Not in yet'}</strong></div>
        </div>

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
            <span className="small muted">Submitted by {done.submitted_by}. Today is locked; only an admin can change it.</span>
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
