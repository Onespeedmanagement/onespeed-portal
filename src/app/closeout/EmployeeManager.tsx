'use client';
import { useActionState, useState, useTransition } from 'react';
import { addEmployee, removeEmployee, renameEmployee, type FormState } from './actions';

export function EmployeeManager({ businessId, employees }: { businessId: string; employees: { id: string; name: string }[] }) {
  const [state, add, adding] = useActionState<FormState, FormData>(addEmployee, {});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, start] = useTransition();

  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <h2>Your store&apos;s employees</h2>
        <p className="small muted" style={{ margin: '4px 0 0' }}>Add new hires, fix a name, or remove someone who left. Removing keeps their past shorts and overs in the admin log.</p>
      </div>
      {employees.map((e) => (
        <div key={e.id} className="row between" style={{ padding: '10px 14px', border: '1px solid #ede6d3', borderRadius: 10 }}>
          {editing === e.id ? (
            <input type="text" aria-label="New name" value={draft} onChange={(ev) => setDraft(ev.target.value)} style={{ flex: '1 1 200px', width: 'auto' }} />
          ) : (
            <strong>{e.name}</strong>
          )}
          <div className="row">
            {editing === e.id ? (
              <>
                <button className="btn" disabled={busy} onClick={() => start(async () => {
                  const r = await renameEmployee(e.id, draft, e.name); setMsg(r.error ?? null); if (!r.error) setEditing(null);
                })}>Save</button>
                <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
              </>
            ) : (
              <>
                <button className="btn secondary" onClick={() => { setEditing(e.id); setDraft(e.name); }}>Rename</button>
                <button className="btn danger" disabled={busy} onClick={() => {
                  if (!confirm(`Remove ${e.name}? Their history stays in the log.`)) return;
                  start(async () => { const r = await removeEmployee(e.id, e.name); setMsg(r.error ?? null); });
                }}>Remove</button>
              </>
            )}
          </div>
        </div>
      ))}
      <form action={add} className="row" style={{ alignItems: 'flex-end' }}>
        <input type="hidden" name="business_id" value={businessId} />
        <div className="field" style={{ flex: '1 1 240px' }}><label htmlFor="new_emp">Add a new employee</label>
          <input id="new_emp" name="name" type="text" placeholder="Name" /></div>
        <button className="btn" type="submit" disabled={adding}>Add</button>
      </form>
      {(state.error || msg) && <div className="notice bad">{state.error || msg}</div>}
      <span className="small muted">Every add, rename and removal is recorded with who did it and when.</span>
    </section>
  );
}
