'use client';
import { useActionState } from 'react';
import { importHistory, type HistoryResult } from './actions';

export function HistoryForm({ thisYear }: { thisYear: number }) {
  const [result, action, pending] = useActionState<HistoryResult | null, FormData>(importHistory, null);
  return (
    <>
      <form action={action} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label htmlFor="file">Monthly Store Performance Report (PDF)</label>
          <input id="file" name="file" type="file" accept="application/pdf,.pdf" required />
          <span className="small muted">In Google Sheets: File → Download → PDF. Store columns CWS, FF, UP and Suburban are matched to your stores by name. Works with the full-year sheet or a few months printed on their own.</span>
        </div>
        <div className="field" style={{ maxWidth: 260 }}>
          <label htmlFor="year">&ldquo;Current Yr&rdquo; on this sheet is</label>
          <select id="year" name="year" defaultValue={String(thisYear)}>
            {[thisYear + 1, thisYear, thisYear - 1, thisYear - 2].map((y) => <option key={y} value={y}>{y} (Prev Yr = {y - 1})</option>)}
          </select>
        </div>
        <div><button className="btn" type="submit" disabled={pending}>{pending ? 'Reading…' : 'Load monthly totals'}</button></div>
        <span className="small muted">Uploading again later (for example after filling in more months) updates the months that changed.</span>
      </form>
      {result && (
        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className={`notice ${result.ok ? 'good' : 'warn'}`}>{result.message}</div>
          {result.stores.length > 0 && (
            <table>
              <thead><tr><th>Sheet column</th><th>Store</th><th className="r">Months saved</th><th>Months</th><th>Notes</th></tr></thead>
              <tbody>
                {result.stores.map((s) => (
                  <tr key={s.code}>
                    <td>{s.code}</td><td>{s.store ?? '—'}</td><td className="r">{s.months}</td><td className="small">{s.range ?? '—'}</td>
                    <td className="small">{s.warnings.length ? s.warnings.map((w, i) => <div key={i}>{w}</div>) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}
    </>
  );
}
