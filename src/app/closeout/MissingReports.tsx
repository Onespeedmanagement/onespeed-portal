'use client';
import { useActionState } from 'react';
import { uploadMissingReports } from './uploadAction';
import type { IngestResult } from '@/lib/pos/ingest';

const short = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC' });
const PILL: Record<IngestResult['status'], [string, string]> = {
  processed: ['good', '✓ Saved'], duplicate: ['warn', 'Already in'], held: ['bad', 'Held for admin'], unknown_store: ['bad', 'Wrong store'], error: ['bad', 'Not saved'],
};

export function MissingReports({ days }: { days: { business_date: string; has_report: boolean }[] }) {
  const [results, action, pending] = useActionState<IngestResult[], FormData>(uploadMissingReports, []);
  const missing = days.filter((d) => !d.has_report);
  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div className="row between">
        <h2>Sales reports since {short(days[0].business_date)}</h2>
        <span className={`pill ${missing.length ? 'warn' : 'good'}`}>{missing.length ? `${missing.length} missing` : '✓ All in'}</span>
      </div>
      <div className="row" style={{ gap: 6 }}>
        {days.map((d) => (
          <span key={d.business_date} className={`pill ${d.has_report ? 'good' : 'warn'}`} style={{ fontSize: 12, padding: '4px 10px' }}>
            {short(d.business_date)} {d.has_report ? '✓' : '· missing'}
          </span>
        ))}
      </div>
      {missing.length > 0 && (
        <form action={action} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div className="row">
            <input name="files" type="file" accept="application/pdf,.pdf" multiple aria-label="POS report PDFs" style={{ flex: '1 1 240px' }} />
            <button className="btn secondary" type="submit" disabled={pending}>{pending ? 'Checking…' : 'Upload'}</button>
          </div>
          <span className="small muted">Select all the missing days&apos; “Cash and Sales Summary” PDFs at once. Each day can be uploaded once; days already in are skipped. This is sales only. Cash close-outs are still done one day at a time above.</span>
        </form>
      )}
      {results.length > 0 && (
        <table>
          <thead><tr><th>File</th><th>Day</th><th>Result</th><th>Details</th></tr></thead>
          <tbody>
            {results.map((r, i) => (
              <tr key={i}>
                <td className="small">{r.filename}</td><td className="small">{r.businessDate ? short(r.businessDate) : '—'}</td>
                <td><span className={`pill ${PILL[r.status][0]}`}>{PILL[r.status][1]}</span></td>
                <td className="small">{r.message}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
