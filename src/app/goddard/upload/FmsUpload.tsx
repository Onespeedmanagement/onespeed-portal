'use client';
import { useActionState } from 'react';
import { uploadFms, addSchool, type FmsResult } from './actions';

const PILL: Record<FmsResult['status'], [string, string]> = {
  saved: ['good', '✓ Saved'], updated: ['good', '✓ Updated'], held: ['warn', 'Not saved'], unknown_school: ['warn', 'New school'], error: ['bad', 'Couldn’t read'],
};

export function FmsUpload({ isAdmin }: { isAdmin: boolean }) {
  const [results, action, pending] = useActionState<FmsResult[], FormData>(uploadFms, []);
  return (
    <>
      <form action={action} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div className="field">
          <label htmlFor="fms">FMS Monthly Financial Report (PDF), one or many</label>
          <input id="fms" name="files" type="file" accept="application/pdf,.pdf" multiple required />
          <span className="small muted">The school and month are read from inside each report (e.g. “Hockessin, DE (#1230) · September 2026”), so a report can’t land on the wrong school. Uploading a month again replaces it. Past months are welcome: load history the same way.</span>
        </div>
        <label className="small" style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input type="checkbox" name="save_anyway" /> Save even if the report’s numbers don’t add up</label>
        <div><button className="btn" type="submit" disabled={pending}>{pending ? 'Reading…' : 'Upload'}</button></div>
      </form>
      {results.length > 0 && (
        <section className="card scroll">
          <table style={{ minWidth: 640 }}>
            <thead><tr><th>File</th><th>School</th><th>Result</th></tr></thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td className="small">{r.filename || '—'}</td>
                  <td>{r.school ?? (r.schoolName ? `${r.schoolName} (#${r.schoolNumber ?? '?'})` : '—')}</td>
                  <td>
                    <span className={`pill ${PILL[r.status][0]}`}>{PILL[r.status][1]}</span> <span className="small">{r.message}</span>
                    {r.failed && <ul className="small muted" style={{ margin: '6px 0 0 18px' }}>{r.failed.map((f) => <li key={f}>{f}</li>)}</ul>}
                    {r.status === 'unknown_school' && isAdmin && (
                      <form action={addSchool} className="row" style={{ marginTop: 8 }}>
                        <input type="hidden" name="number" value={r.schoolNumber ?? ''} />
                        <input name="name" defaultValue={`Goddard ${r.schoolName?.split(',')[0] ?? ''}`.trim()} aria-label="School name" style={{ width: 'auto', flex: '1 1 200px' }} />
                        <button className="btn secondary" type="submit">Add this school</button>
                        <span className="small muted">then upload the file again</span>
                      </form>
                    )}
                    {r.status === 'unknown_school' && !isAdmin && <div className="small muted">Ask Ujash or Vrajesh to add this school.</div>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
