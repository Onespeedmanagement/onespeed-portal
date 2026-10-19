'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { recordSchoolFile } from '../upload/actions';

const MAX = 50 * 1024 * 1024;
const KINDS = [['forecast', 'Monthly Forecasted Billing'], ['new_enrollments', 'New families starting next month'], ['ar_ledger', 'A/R Ledger'], ['deposits', 'Deposit History'], ['other', 'Other']] as const;

// Uploads straight from the browser to private storage, then records it under the school and month.
export function SchoolFileUpload({ businessId, month }: { businessId: string; month: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<string>('forecast');
  const [m, setM] = useState(month.slice(0, 7));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function onChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setBusy(true); setMsg(null);
    const supabase = supabaseBrowser();
    const problems: string[] = [];
    for (const f of files) {
      if (f.size > MAX) { problems.push(`${f.name} is over 50 MB`); continue; }
      if (!/\.(pdf|xlsx?|csv|png|jpe?g)$/i.test(f.name)) { problems.push(`${f.name}: upload a PDF, Excel, CSV or photo`); continue; }
      const path = `${businessId}/${m}/${kind}-${Date.now()}-${f.name.replace(/[^\w.\-]+/g, '_')}`;
      const { error } = await supabase.storage.from('school-reports').upload(path, f, { contentType: f.type || undefined });
      if (error) { problems.push(`${f.name} didn’t upload`); continue; }
      const r = await recordSchoolFile(businessId, `${m}-01`, kind, path, f.name);
      if (r.error) problems.push(`${f.name}: ${r.error}`);
    }
    e.target.value = '';
    setBusy(false);
    setMsg(problems.length ? { ok: false, text: problems.join('; ') } : { ok: true, text: 'Uploaded.' });
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div className="row" style={{ alignItems: 'flex-end' }}>
        <div className="field" style={{ flex: '1 1 220px' }}><label htmlFor="sf-kind">Report</label>
          <select id="sf-kind" value={kind} onChange={(e) => setKind(e.target.value)}>{KINDS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></div>
        <div className="field" style={{ flex: '0 1 170px' }}><label htmlFor="sf-month">For month</label>
          <input id="sf-month" type="month" value={m} onChange={(e) => setM(e.target.value)} /></div>
        <label className="btn secondary" style={{ cursor: busy ? 'default' : 'pointer' }}>
          {busy ? 'Uploading…' : 'Choose file…'}
          <input type="file" multiple accept=".pdf,.xls,.xlsx,.csv,.png,.jpg,.jpeg" onChange={onChange} disabled={busy || !m} style={{ display: 'none' }} />
        </label>
      </div>
      {msg && <div className={`notice ${msg.ok ? 'good' : 'bad'}`}>{msg.text}</div>}
    </div>
  );
}
