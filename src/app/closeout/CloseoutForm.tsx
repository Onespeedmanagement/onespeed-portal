'use client';
import { useActionState, useState } from 'react';
import { submitCloseout, type FormState } from './actions';
import { money, signedMoney, toCents } from '@/lib/format';

type Props = {
  businessId: string;
  businessDate: string;
  cashSales: number | null;
  tolerance: number;
  employees: { id: string; name: string }[];
};

export function CloseoutForm({ businessId, businessDate, cashSales, tolerance, employees }: Props) {
  const [state, action, pending] = useActionState<FormState, FormData>(submitCloseout, {});
  const [counted, setCounted] = useState('');
  const [paidOut, setPaidOut] = useState('');
  const [petty, setPetty] = useState('');
  const [picked, setPicked] = useState<string[]>([]);

  const diff = cashSales == null || counted === ''
    ? null
    : Math.round((toCents(counted) + toCents(paidOut) + toCents(petty) - cashSales) * 100) / 100;
  const status = diff == null || Number.isNaN(diff) ? null
    : Math.abs(diff) <= tolerance ? 'match' : diff < 0 ? 'short' : 'over';
  const names = employees.filter((e) => picked.includes(e.id)).map((e) => e.name).join(', ');

  return (
    <form action={action} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <input type="hidden" name="business_id" value={businessId} />
      <input type="hidden" name="business_date" value={businessDate} />

      <div className="grid">
        <div className="field"><label htmlFor="cash_counted">Cash counted</label>
          <input id="cash_counted" name="cash_counted" type="text" inputMode="decimal" placeholder="0.00" value={counted} onChange={(e) => setCounted(e.target.value)} required /></div>
        <div className="field"><label htmlFor="paid_out">Cash paid out</label>
          <input id="paid_out" name="paid_out" type="text" inputMode="decimal" placeholder="0.00" value={paidOut} onChange={(e) => setPaidOut(e.target.value)} /></div>
        <div className="field"><label htmlFor="paid_out_reason">Paid out for</label>
          <select id="paid_out_reason" name="paid_out_reason" defaultValue="">
            <option value="">—</option><option>Payroll</option><option>Vendor</option><option>Other</option>
          </select></div>
        <div className="field"><label htmlFor="petty_change">Petty change taken</label>
          <input id="petty_change" name="petty_change" type="text" inputMode="decimal" placeholder="0.00" value={petty} onChange={(e) => setPetty(e.target.value)} /></div>
        <div className="field"><label htmlFor="held_for_next">Held for next deposit</label>
          <input id="held_for_next" name="held_for_next" type="text" inputMode="decimal" placeholder="0.00" /></div>
      </div>

      <fieldset style={{ border: 0, margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 8 }}>
        <legend style={{ fontWeight: 500, fontSize: 14, marginBottom: 8 }}>Who was on the register</legend>
        <div className="row">
          {employees.length === 0 && <span className="small muted">No employees yet. Add them below.</span>}
          {employees.map((e) => (
            <label key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', border: '1px solid #d8cfb6', borderRadius: 8, background: picked.includes(e.id) ? '#eef3ee' : '#fff', fontWeight: 400 }}>
              <input type="checkbox" name="employee_id" value={e.id} checked={picked.includes(e.id)}
                onChange={(ev) => setPicked(ev.target.checked ? [...picked, e.id] : picked.filter((x) => x !== e.id))}
                style={{ width: 18, height: 18 }} />
              {e.name}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="field"><label htmlFor="note">Note (optional)</label>
        <input id="note" name="note" type="text" placeholder="Anything the admin should know" /></div>

      <div className="row between" style={{ borderTop: '1px solid var(--line-soft)', paddingTop: 16 }}>
        <div className="row num">
          {cashSales == null ? (
            <span className="small muted">The difference appears once tonight&apos;s POS report arrives.</span>
          ) : diff == null ? (
            <span className="small muted">POS cash {money(cashSales)}. Enter the cash counted.</span>
          ) : (
            <>
              <span>Difference <strong style={{ fontSize: 22, color: status === 'match' ? 'var(--good)' : status === 'short' ? 'var(--bad)' : 'var(--warn)' }}>{signedMoney(diff)}</strong></span>
              {status === 'match' && <span className="pill good">✓ Matched</span>}
              {status === 'short' && <span className="pill bad">✕ Short{names ? ` · ${names}` : ''}</span>}
              {status === 'over' && <span className="pill warn">▲ Over{names ? ` · ${names}` : ''}</span>}
            </>
          )}
        </div>
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Submitting…' : 'Submit close-out'}</button>
      </div>
      {state.error && <div className="notice bad">{state.error}</div>}
    </form>
  );
}
