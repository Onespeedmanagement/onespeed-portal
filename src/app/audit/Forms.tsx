'use client';
import { useActionState } from 'react';
import { addRule, uploadAudit, type UploadState } from './actions';

const HELP = {
  amazon: 'Amazon Business → Reports → Orders report → Jan 1 2026 to today → download CSV. One file per store account.',
  chase: 'chase.com → the card → Download account activity → CSV → Jan 1 2026 to today. One file per card.',
  register: 'QuickBooks → Banking → the store’s bank account → Register → Export to Excel, dates Jan 1 2026 to today.',
} as const;

export function UploadBox({ source, stores }: { source: 'amazon' | 'chase' | 'register'; stores: { id: string; name: string }[] }) {
  const [s, action, pending] = useActionState<UploadState, FormData>(uploadAudit, {});
  return (
    <form action={action} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input type="hidden" name="source" value={source} />
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: '0 1 260px' }}>
          <label htmlFor={`st-${source}`}>{source === 'chase' ? 'This card is for' : 'Store'}</label>
          <select id={`st-${source}`} name="business_id" required={source !== 'chase'} defaultValue="">
            <option value="" disabled={source !== 'chase'}>{source === 'chase' ? 'Several stores / company' : 'Pick the store…'}</option>
            {stores.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}
          </select>
        </div>
        {source === 'chase' && <div className="field" style={{ flex: '0 1 160px' }}><label htmlFor="card-label">Card (last 4)</label><input id="card-label" name="label" placeholder="e.g. 4821" maxLength={20} /></div>}
        <div className="field" style={{ flex: '1 1 240px' }}><label htmlFor={`f-${source}`}>File (CSV or Excel)</label><input id={`f-${source}`} name="file" type="file" accept=".csv,.xls,.xlsx,.txt" required /></div>
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Reading…' : 'Upload'}</button>
      </div>
      <span className="small muted">{HELP[source]} Uploading an overlapping date range again is fine: lines already loaded are skipped.</span>
      {s.error && <div className="notice bad">{s.error}</div>}
      {s.ok && <div className="notice good">✓ {s.ok}</div>}
    </form>
  );
}

export function RuleForm({ categories }: { categories: string[] }) {
  const [s, action, pending] = useActionState<UploadState, FormData>(addRule, {});
  return (
    <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: '1 1 220px' }}><label htmlFor="r-pat">When the vendor or item contains</label><input id="r-pat" name="pattern" placeholder="e.g. KYMP or receipt paper" required /></div>
        <div className="field" style={{ flex: '0 1 240px' }}><label htmlFor="r-cat">Put it in</label>
          <select id="r-cat" name="category" defaultValue="">{['', ...categories].map((c) => <option key={c} value={c}>{c || 'Pick a category…'}</option>)}</select></div>
        <div className="field" style={{ flex: '0 1 200px' }}><label htmlFor="r-new">…or a new category</label><input id="r-new" name="category_new" placeholder="optional" /></div>
        <button className="btn secondary" type="submit" disabled={pending}>{pending ? 'Saving…' : 'Add rule'}</button>
      </div>
      {s.error && <div className="notice bad">{s.error}</div>}
      {s.ok && <div className="notice good">✓ {s.ok}</div>}
    </form>
  );
}
