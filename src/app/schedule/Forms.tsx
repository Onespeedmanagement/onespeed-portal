'use client';
import { useActionState } from 'react';
import { uploadSchedule, type SchedState } from './actions';

export function ScheduleUpload({ businessId, storeName }: { businessId: string; storeName: string }) {
  const [s, action, pending] = useActionState<SchedState, FormData>(uploadSchedule, {});
  return (
    <form action={action} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input type="hidden" name="business_id" value={businessId} />
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: '1 1 280px' }}>
          <label htmlFor="sched">Week’s schedule for {storeName} (When I Work → Excel)</label>
          <input id="sched" name="file" type="file" accept=".xlsx,.xls,.csv" required />
        </div>
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Reading…' : 'Upload'}</button>
      </div>
      <span className="small muted">In When I Work, export the week to Excel (not PDF). Uploading the same week again replaces it, so re-upload after changes.</span>
      {s.error && <div className="notice bad">{s.error}</div>}
    </form>
  );
}
