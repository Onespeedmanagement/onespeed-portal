'use client';
import { useActionState, useState } from 'react';
import { uploadInventory, saveInventoryManual, type InvState } from './actions';

function Result({ s }: { s: InvState }) {
  if (s.error) return <div className="notice bad">{s.error}</div>;
  if (!s.ok) return null;
  return (
    <div className="notice good">
      ✓ {s.ok}
      {s.unmatched && s.unmatched.length > 0 && <div className="small" style={{ marginTop: 6 }}>Not matching a POS department name (they’ll show without sales): {s.unmatched.join(', ')}. Rename them in the file to match the POS report if they’re the same department.</div>}
    </div>
  );
}

export function InventoryForms({ businessId, storeName, departments, today }: { businessId: string; storeName: string; departments: string[]; today: string }) {
  const [up, upload, uploading] = useActionState<InvState, FormData>(uploadInventory, {});
  const [man, saveManual, saving] = useActionState<InvState, FormData>(saveInventoryManual, {});
  const [extra, setExtra] = useState(0);
  const rows = [...departments, ...Array.from({ length: extra }, () => '')];
  return (
    <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <h2>Add inventory for {storeName}</h2>
      <form action={upload} className="row" style={{ alignItems: 'flex-end' }}>
        <input type="hidden" name="business_id" value={businessId} />
        <div className="field" style={{ flex: '0 1 180px' }}><label htmlFor="as_of_f">Counted on</label><input id="as_of_f" name="as_of" type="date" defaultValue={today} required /></div>
        <div className="field" style={{ flex: '1 1 260px' }}><label htmlFor="inv_file">Inventory Value Analysis Report (PDF), or Excel / CSV</label><input id="inv_file" name="file" type="file" accept=".pdf,.xlsx,.xls,.csv" /></div>
        <button className="btn" type="submit" disabled={uploading}>{uploading ? 'Reading…' : 'Upload'}</button>
      </form>
      <span className="small muted">From the POS: Inventory Value Analysis Report. The store and “As Of” date are read from the report, and it’s refused if it’s for a different store. Excel / CSV exports work too (Department + cost columns). Uploading the same store and date again replaces it.</span>
      <Result s={up} />

      <details>
        <summary className="small" style={{ cursor: 'pointer' }}>Or type the numbers in</summary>
        <form action={saveManual} style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 10 }}>
          <input type="hidden" name="business_id" value={businessId} />
          <div className="field" style={{ maxWidth: 200 }}><label htmlFor="as_of_m">Counted on</label><input id="as_of_m" name="as_of" type="date" defaultValue={today} required /></div>
          <table className="num" style={{ maxWidth: 560 }}>
            <thead><tr><th>Department</th><th className="r">Inventory at cost ($)</th><th className="r">Units (optional)</th></tr></thead>
            <tbody>
              {rows.map((d, i) => (
                <tr key={i}>
                  <td>{d ? <>{d}<input type="hidden" name={`dept_${i}`} value={d} /></> : <input name={`dept_${i}`} placeholder="Department" aria-label="Department" />}</td>
                  <td className="r"><input name={`cost_${i}`} inputMode="decimal" aria-label={`${d || 'Department'} inventory at cost`} style={{ textAlign: 'right' }} /></td>
                  <td className="r"><input name={`qty_${i}`} inputMode="numeric" aria-label={`${d || 'Department'} units`} style={{ textAlign: 'right' }} /></td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="row"><button type="button" className="btn secondary" onClick={() => setExtra((n) => n + 1)}>+ Another department</button>
            <button className="btn" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save inventory'}</button></div>
          <Result s={man} />
        </form>
      </details>
    </section>
  );
}
