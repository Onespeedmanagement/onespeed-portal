'use client';
import { useActionState, useState } from 'react';
import { addLine, saveBalance, type FormState } from './actions';
import { LINE_TYPES } from '@/lib/owners';

export function BalanceForm({ businessId, date, balance, status }: { businessId: string; date: string; balance: number | null; status: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(saveBalance, {});
  return (
    <form action={action} className="row" style={{ alignItems: 'flex-end' }}>
      <input type="hidden" name="business_id" value={businessId} />
      <input type="hidden" name="business_date" value={date} />
      <div className="field" style={{ flex: '1 1 220px' }}><label htmlFor="qb_balance">WSFS QuickBooks balance</label>
        <input id="qb_balance" name="qb_balance" type="text" inputMode="decimal" defaultValue={balance ?? ''} placeholder="0.00" style={{ fontSize: 18, fontWeight: 600 }} /></div>
      <div className="field" style={{ flex: '0 1 160px' }}><label htmlFor="balance_status">Status</label>
        <select id="balance_status" name="balance_status" defaultValue={status}><option value="good">Good</option><option value="watch">Watch</option><option value="low">Low</option></select></div>
      <button className="btn" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Save balance'}</button>
      {state.error && <div className="notice bad" style={{ width: '100%' }}>{state.error}</div>}
      {state.ok && <div className="notice good" style={{ width: '100%' }}>{state.ok}</div>}
    </form>
  );
}

export function LineForm({ businessId, date, distributors }: { businessId: string; date: string; distributors: { id: string; name: string }[] }) {
  const [state, action, pending] = useActionState<FormState, FormData>(addLine, {});
  const [type, setType] = useState('distributor_check');
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 10, borderTop: '1px solid var(--line-soft)', paddingTop: 14 }}>
      <input type="hidden" name="business_id" value={businessId} />
      <input type="hidden" name="business_date" value={date} />
      <strong>Add a line</strong>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}>
        <div className="field"><label htmlFor="line_type">Type</label>
          <select id="line_type" name="line_type" value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(LINE_TYPES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>
        {type === 'distributor_check' ? (
          <>
            <div className="field"><label htmlFor="distributor_id">Distributor</label>
              <select id="distributor_id" name="distributor_id" defaultValue="">
                <option value="">Choose…</option>
                {distributors.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select></div>
            <div className="field"><label htmlFor="new_distributor">…or add new</label>
              <input id="new_distributor" name="new_distributor" type="text" placeholder="Distributor name" /></div>
            <div className="field"><label htmlFor="check_number">Check #</label><input id="check_number" name="check_number" type="text" /></div>
            <div className="field"><label htmlFor="check_date">Check date</label><input id="check_date" name="check_date" type="date" defaultValue={date} /></div>
          </>
        ) : (
          <div className="field" style={{ gridColumn: 'span 2' }}><label htmlFor="memo">Memo / payee</label><input id="memo" name="memo" type="text" placeholder="e.g. Payroll Tax" /></div>
        )}
        <div className="field"><label htmlFor="debit">Debit</label><input id="debit" name="debit" type="text" inputMode="decimal" placeholder="0.00" /></div>
        <div className="field"><label htmlFor="credit">Credit</label><input id="credit" name="credit" type="text" inputMode="decimal" placeholder="0.00" /></div>
      </div>
      <div><button className="btn secondary" type="submit" disabled={pending}>{pending ? 'Adding…' : '+ Add line'}</button></div>
      {state.error && <div className="notice bad">{state.error}</div>}
    </form>
  );
}
