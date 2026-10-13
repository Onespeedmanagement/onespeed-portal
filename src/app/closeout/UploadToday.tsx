'use client';
import { useActionState } from 'react';
import { uploadTodaysReport } from './uploadAction';
import type { IngestResult } from '@/lib/pos/ingest';

export function UploadToday({ hasReport, businessDate, label }: { hasReport: boolean; businessDate: string; label: string }) {
  const [result, action, pending] = useActionState<IngestResult | null, FormData>(uploadTodaysReport, null);
  if (hasReport) {
    return <div className="notice good">✓ POS report for {label} is in. Each day is uploaded once; ask an admin if it needs replacing.</div>;
  }
  return (
    <form action={action} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: 18 }}>
      <div className="row between">
        <strong>Upload the POS report for {label}</strong>
        <span className="small muted">Your store only</span>
      </div>
      <input type="hidden" name="business_date" value={businessDate} />
      <div className="row">
        <input name="file" type="file" accept="application/pdf,.pdf" aria-label="POS report PDF" style={{ flex: '1 1 240px' }} />
        <button className="btn secondary" type="submit" disabled={pending}>{pending ? 'Checking…' : 'Upload'}</button>
      </div>
      <span className="small muted">Print the POS “Cash and Sales Summary” for this day and upload the PDF. It&apos;s checked before it&apos;s saved.</span>
      {result && (
        <div className={`notice ${result.status === 'processed' ? 'good' : result.status === 'duplicate' ? 'warn' : 'bad'}`}>
          {result.status === 'processed' ? `✓ Saved. ${result.message}` : result.message}
        </div>
      )}
    </form>
  );
}
