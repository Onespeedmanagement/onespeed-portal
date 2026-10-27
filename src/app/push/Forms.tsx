'use client';
import { useActionState } from 'react';
import { uploadUnsold, type PushState } from './actions';

export function UnsoldUpload({ businessId, storeName }: { businessId: string; storeName: string }) {
  const [s, action, pending] = useActionState<PushState, FormData>(uploadUnsold, {});
  return (
    <form action={action} className="card no-print" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input type="hidden" name="business_id" value={businessId} />
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: '1 1 280px' }}>
          <label htmlFor="unsold">Unsold Item List Report for {storeName} (Excel)</label>
          <input id="unsold" name="file" type="file" accept=".xls,.xlsx,.csv" required />
        </div>
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Reading…' : 'Upload'}</button>
      </div>
      <span className="small muted">In the POS: Unsold Item List Report, the last 6 months or the year, then export to Excel. Uploading a new one replaces the list.</span>
      {s.error && <div className="notice bad">{s.error}</div>}
      {s.ok && <div className="notice good">✓ {s.ok}</div>}
    </form>
  );
}

export function PrintButton() {
  return <button type="button" className="btn secondary no-print" onClick={() => window.print()}>Print for staff</button>;
}

// Copy the focus list as plain text (for a group text / WhatsApp)
export function CopyList({ text }: { text: string }) {
  return (
    <button type="button" className="btn secondary no-print" onClick={async () => {
      try { await navigator.clipboard.writeText(text); alert('Copied. Paste it into your staff group text.'); } catch { prompt('Copy this:', text); }
    }}>Copy as text</button>
  );
}
