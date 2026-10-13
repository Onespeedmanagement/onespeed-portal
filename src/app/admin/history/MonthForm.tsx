'use client';
import { useActionState } from 'react';
import { saveMonth } from './actions';

export function MonthForm({ stores }: { stores: { id: string; name: string }[] }) {
  const [msg, action, pending] = useActionState<string | null, FormData>(saveMonth, null);
  return (
    <form action={action} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <h2>Add or fix one month</h2>
      <span className="small muted">For a store or month that isn&apos;t on the sheet. Customers and profit % can be left blank if you don&apos;t have them. Saving a month that&apos;s already there replaces it.</span>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field"><label htmlFor="mf-store">Store</label>
          <select id="mf-store" name="business_id" required>{stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></div>
        <div className="field"><label htmlFor="mf-month">Month</label><input id="mf-month" name="month" type="month" required /></div>
        <div className="field"><label htmlFor="mf-rev">Revenue</label><input id="mf-rev" name="revenue" inputMode="decimal" placeholder="155,789.86" required /></div>
        <div className="field"><label htmlFor="mf-cust">Customers</label><input id="mf-cust" name="customers" inputMode="numeric" placeholder="optional" /></div>
        <div className="field"><label htmlFor="mf-pct">Profit %</label><input id="mf-pct" name="profit_pct" inputMode="decimal" placeholder="optional" /></div>
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save month'}</button>
      </div>
      {msg && <div className={`notice ${msg.startsWith('Saved') ? 'good' : 'warn'}`}>{msg}</div>}
    </form>
  );
}
