'use client';
import { useActionState } from 'react';
import { editDay, type EditState } from './actions';

type Nums = { total_sales: number | null; card_sales: number | null; cash_sales: number | null; transactions: number | null } | null;

export function EditForm({ businessId, date, current }: { businessId: string; date: string; current: Nums }) {
  const [state, action, pending] = useActionState<EditState, FormData>(editDay, {});
  const f = (n: number | null | undefined) => (n == null ? '' : Number(n).toFixed(2));
  return (
    <form action={action} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <input type="hidden" name="business_id" value={businessId} />
      <input type="hidden" name="business_date" value={date} />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
        <div className="field"><label htmlFor="total_sales">Total sales</label><input id="total_sales" name="total_sales" inputMode="decimal" defaultValue={f(current?.total_sales)} /></div>
        <div className="field"><label htmlFor="card_sales">Card sales</label><input id="card_sales" name="card_sales" inputMode="decimal" defaultValue={f(current?.card_sales)} /></div>
        <div className="field"><label htmlFor="cash_sales">Cash sales (net cash-flow)</label><input id="cash_sales" name="cash_sales" inputMode="decimal" defaultValue={f(current?.cash_sales)} /></div>
        <div className="field"><label htmlFor="transactions">Customers (optional)</label><input id="transactions" name="transactions" inputMode="numeric" defaultValue={current?.transactions ?? ''} /></div>
      </div>
      <div className="field"><label htmlFor="reason">Why are you changing these?</label>
        <input id="reason" name="reason" type="text" placeholder="e.g. matched to the original POS printout" required /></div>
      <div className="row">
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save numbers'}</button>
        <span className="small muted">Ujash and Vrajesh are alerted with the old and new numbers. The cash short/over recalculates from the new cash sales.</span>
      </div>
      {state.error && <div className="notice bad">{state.error}</div>}
      {state.ok && <div className="notice good">{state.ok}</div>}
    </form>
  );
}
