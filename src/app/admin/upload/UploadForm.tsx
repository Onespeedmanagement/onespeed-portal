'use client';
import { useActionState } from 'react';
import { uploadPosFiles } from './actions';
import type { IngestResult } from '@/lib/pos/ingest';

const LABEL: Record<IngestResult['status'], [string, string]> = {
  processed: ['good', '✓ Saved'],
  duplicate: ['warn', 'Already had it'],
  held: ['bad', 'Held'],
  unknown_store: ['bad', 'Unknown store'],
  error: ['bad', 'Error'],
};

export function UploadForm() {
  const [results, action, pending] = useActionState<IngestResult[], FormData>(uploadPosFiles, []);
  return (
    <>
      <form action={action} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div className="field">
          <label htmlFor="files">POS “Cash and Sales Summary” PDFs</label>
          <input id="files" name="files" type="file" accept="application/pdf,.pdf" multiple required />
          <span className="small muted">Pick one or many. Each file is checked before anything is saved; the same file twice is ignored.</span>
        </div>
        <div><button className="btn" type="submit" disabled={pending}>{pending ? 'Reading…' : 'Upload and check'}</button></div>
      </form>
      {results.length > 0 && (
        <section className="card scroll">
          <table>
            <thead><tr><th>File</th><th>Store</th><th>Date</th><th>Result</th><th>Details</th></tr></thead>
            <tbody>
              {results.map((r, i) => (
                <tr key={i}>
                  <td>{r.filename}</td><td>{r.store ?? '—'}</td><td>{r.businessDate ?? '—'}</td>
                  <td><span className={`pill ${LABEL[r.status][0]}`}>{LABEL[r.status][1]}</span></td>
                  <td className="small">{r.message}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}
    </>
  );
}
