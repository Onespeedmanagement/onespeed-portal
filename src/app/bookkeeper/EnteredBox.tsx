'use client';
import { useTransition } from 'react';
import { toggleEntered } from './actions';

export function EnteredBox({ businessId, date, entered }: { businessId: string; date: string; entered: boolean }) {
  const [pending, start] = useTransition();
  return (
    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400, whiteSpace: 'nowrap' }}>
      <input type="checkbox" defaultChecked={entered} disabled={pending} style={{ width: 18, height: 18 }}
        onChange={(e) => start(() => toggleEntered(businessId, date, e.target.checked))} />
      Entered
    </label>
  );
}
