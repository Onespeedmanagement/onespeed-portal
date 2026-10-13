'use client';
import { useActionState } from 'react';
import { editCloseout, type EditState } from './actions';

type Cash = { cash_counted: number; paid_out: number; paid_out_reason: string | null; petty_change: number; held_for_next: number; submitted_by: string } | null;

export function CashForm({ businessId, date, current, posCash }: { businessId: string; date: string; current: Cash; posCash: number | null }) {
  const [state, action, pending] = useActionState<EditState, FormData>(editCloseout, {});
  const f = (n: number | null | undefined) => (n == null ? '' : Number(n).toFixed(2));
  return (
    <form action={action} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input type="hidden" name="business_id" value={businessId} />
      <input type="hidden" name="business_date" value={date} />
      <div className="row between">
        <h2>Cash close-out</h2>
        <span className="small muted">{current ? `Entered by ${current.submitted_by}` : 'No close-out entered for this day'}{posCash != null ? ` · POS cash ${posCash.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}` : ''}</span>
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div className="field"><label htmlFor="cash_counted">Cash counted</label><input id="cash_counted" name="cash_counted" inputMode="decimal" defaultValue={f(current?.cash_counted)} required /></div>
        <div className="field"><label htmlFor="paid_out">Cash paid out (not rung on the POS)</label><input id="paid_out" name="paid_out" inputMode="decimal" defaultValue={f(current?.paid_out ?? 0)} /></div>
        <div className="field"><label htmlFor="paid_out_reason">Paid out for</label><input id="paid_out_reason" name="paid_out_reason" type="text" defaultValue={current?.paid_out_reason ?? ''} /></div>
        <div className="field"><label htmlFor="petty_change">Petty change taken</label><input id="petty_change" name="petty_change" inputMode="decimal" defaultValue={f(current?.petty_change ?? 0)} /></div>
        <div className="field"><label htmlFor="held_for_next">Held for next deposit</label><input id="held_for_next" name="held_for_next" inputMode="decimal" defaultValue={f(current?.held_for_next ?? 0)} /></div>
      </div>
      <div className="field"><label htmlFor="cash_reason">Why are you changing the cash?</label>
        <input id="cash_reason" name="reason" type="text" placeholder="e.g. matched to the deposit slip" required /></div>
      <div className="row">
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save cash'}</button>
        <span className="small muted">Short/over = cash counted + paid out + petty change − POS cash. Ujash and Vrajesh are alerted with the old and new amounts.</span>
      </div>
      {state.error && <div className="notice bad">{state.error}</div>}
      {state.ok && <div className="notice good">{state.ok}</div>}
    </form>
  );
}
