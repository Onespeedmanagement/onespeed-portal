'use client';
import { useActionState, useState, useTransition } from 'react';
import { addStore, updateStore, type FormState } from './actions';

type Portfolio = { id: string; name: string };
type Store = { id: string; name: string; pos_match: string | null; active: boolean; portfolio_id: string };

export function StoresEditor({ portfolios, stores }: { portfolios: Portfolio[]; stores: Store[] }) {
  const [state, add, adding] = useActionState<FormState, FormData>(addStore, {});
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState({ name: '', pos_match: '' });
  const [msg, setMsg] = useState<FormState>({});
  const [busy, start] = useTransition();
  const pName = (id: string) => portfolios.find((p) => p.id === id)?.name ?? '';

  return (
    <>
      <form action={add} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <h2>Add a location</h2>
        <div className="grid">
          <div className="field"><label htmlFor="portfolio_id">Portfolio</label>
            <select id="portfolio_id" name="portfolio_id" defaultValue={portfolios[0]?.id}>
              {portfolios.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select></div>
          <div className="field"><label htmlFor="name">Name</label>
            <input id="name" name="name" type="text" placeholder="e.g. Fairfield Liquors" /></div>
          <div className="field"><label htmlFor="pos_match">Name on the POS report</label>
            <input id="pos_match" name="pos_match" type="text" placeholder="Leave blank to use the name" /></div>
        </div>
        <span className="small muted">“Name on the POS report” is how the store&apos;s name is printed at the top of its nightly PDF. It&apos;s how the portal knows which store a report belongs to. Part of the name is enough, like “Christiana Wine”.</span>
        <div><button className="btn" type="submit" disabled={adding}>{adding ? 'Adding…' : 'Add location'}</button></div>
        {state.error && <div className="notice bad">{state.error}</div>}
        {state.ok && <div className="notice good">{state.ok}</div>}
      </form>

      <section className="card scroll">
        <table style={{ minWidth: 760 }}>
          <thead><tr><th>Location</th><th>Portfolio</th><th>Name on POS report</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {stores.map((s) => (
              <tr key={s.id}>
                {editing === s.id ? (
                  <>
                    <td><input type="text" aria-label="Name" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} /></td>
                    <td>{pName(s.portfolio_id)}</td>
                    <td><input type="text" aria-label="Name on POS report" value={draft.pos_match} onChange={(e) => setDraft({ ...draft, pos_match: e.target.value })} /></td>
                    <td>{s.active ? <span className="pill good">Active</span> : <span className="pill warn">Inactive</span>}</td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn" disabled={busy} onClick={() => start(async () => {
                        const r = await updateStore(s.id, draft); setMsg(r); if (!r.error) setEditing(null);
                      })}>Save</button>{' '}
                      <button className="btn secondary" onClick={() => setEditing(null)}>Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td><strong>{s.name}</strong></td>
                    <td>{pName(s.portfolio_id)}</td>
                    <td>{s.pos_match ?? <span className="muted">—</span>}</td>
                    <td>{s.active ? <span className="pill good">Active</span> : <span className="pill warn">Inactive</span>}</td>
                    <td className="r" style={{ whiteSpace: 'nowrap' }}>
                      <button className="btn secondary" onClick={() => { setEditing(s.id); setDraft({ name: s.name, pos_match: s.pos_match ?? '' }); }}>Edit</button>{' '}
                      <button className="btn secondary" disabled={busy} onClick={() => {
                        if (s.active && !confirm(`Deactivate ${s.name}? Its history is kept and you can turn it back on.`)) return;
                        start(async () => setMsg(await updateStore(s.id, { active: !s.active })));
                      }}>{s.active ? 'Deactivate' : 'Reactivate'}</button>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
        {msg.error && <div className="notice bad" style={{ marginTop: 12 }}>{msg.error}</div>}
      </section>
    </>
  );
}
