'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { supabaseBrowser } from '@/lib/supabase/client';
import { recordFile } from './actions';

const MAX = 50 * 1024 * 1024;

// Uploads straight from the browser to private storage, then attaches the file to the contract.
export function FileUpload({ contractId }: { contractId: string }) {
  const router = useRouter();
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
      if (!/\.(pdf|png|jpe?g|heic|docx?)$/i.test(f.name)) { problems.push(`${f.name}: upload a PDF, photo or Word file`); continue; }
      const path = `${contractId}/${Date.now()}-${f.name.replace(/[^\w.\-]+/g, '_')}`;
      const { error } = await supabase.storage.from('contracts').upload(path, f, { contentType: f.type || undefined });
      if (error) { problems.push(`${f.name} didn’t upload`); continue; }
      const r = await recordFile(contractId, path, f.name);
      if (r.error) problems.push(`${f.name}: ${r.error}`);
    }
    e.target.value = '';
    setBusy(false);
    setMsg(problems.length ? { ok: false, text: problems.join('; ') } : { ok: true, text: 'Uploaded.' });
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <label className="btn secondary" style={{ alignSelf: 'flex-start', cursor: busy ? 'default' : 'pointer' }}>
        {busy ? 'Uploading…' : 'Upload contract (PDF or photo)'}
        <input type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.heic,.doc,.docx" onChange={onChange} disabled={busy} style={{ display: 'none' }} />
      </label>
      {msg && <div className={`notice ${msg.ok ? 'good' : 'bad'}`}>{msg.text}</div>}
    </div>
  );
}
