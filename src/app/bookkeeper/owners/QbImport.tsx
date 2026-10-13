'use client';
import { useActionState } from 'react';
import { previewQb, saveQb, type QbPreview, type QbSaved } from './qbActions';

const usd = (n: number | null | undefined) => (n == null ? '—' : n.toLocaleString('en-US', { style: 'currency', currency: 'USD' }));
const short = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

export function QbImport({ businessId, date, dateLabel }: { businessId: string; date: string; dateLabel: string }) {
  const [pv, preview, previewing] = useActionState<QbPreview | null, FormData>(previewQb, null);
  const [saved, save, saving] = useActionState<QbSaved, FormData>(saveQb, {});
  const s = pv?.summary;
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 12, borderBottom: '1px solid var(--line-soft)', paddingBottom: 16 }}>
      <form action={preview} className="row" style={{ alignItems: 'flex-end' }}>
        <input type="hidden" name="business_id" value={businessId} />
        <input type="hidden" name="business_date" value={date} />
        <div className="field" style={{ flex: '1 1 280px' }}>
          <label htmlFor="qbfile">QuickBooks register for {dateLabel}</label>
          <input id="qbfile" name="file" type="file" accept=".xls,.xlsx,.csv" />
        </div>
        <button className="btn secondary" type="submit" disabled={previewing}>{previewing ? 'Reading…' : 'Check file'}</button>
      </form>
      <span className="small muted">QuickBooks → Banking → WSFS register → Export to Excel. Upload it here once a day: new payments are added, cleared ones drop off, and the QuickBooks balance fills in. You&apos;ll see the changes before anything is saved.</span>

      {pv?.error && <div className="notice bad">{pv.error}</div>}
      {s && pv?.payload && (
        <div className="card" style={{ background: '#fbf8ef', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <strong>{pv.storeName} · {short(pv.date!)}</strong>
          {pv.storeCheck && <div className={`notice ${pv.storeCheck.ok === false ? 'bad' : pv.storeCheck.ok ? 'good' : 'warn'}`}>{pv.storeCheck.ok ? '✓ ' : ''}{pv.storeCheck.text}</div>}
          <table className="num"><tbody>
            <tr><td>QuickBooks balance (Ending Balance)</td><td className="r"><strong>{usd(s.balance)}</strong></td></tr>
            <tr><td>Bank balance (from the file)</td><td className="r">{usd(s.bankBalance)}</td></tr>
            <tr><td>Outstanding payments</td><td className="r">{s.outstanding.length} · {usd(s.total)}</td></tr>
            {s.depositsInTransit.count > 0 && <tr><td>Deposits not cleared yet</td><td className="r">{s.depositsInTransit.count} · {usd(s.depositsInTransit.total)}</td></tr>}
          </tbody></table>
          <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
            <div style={{ flex: '1 1 260px' }}>
              <div className="small"><strong>New ({pv.added!.length})</strong></div>
              {pv.added!.length === 0 ? <div className="small muted">Nothing new.</div> : pv.added!.map((a) => (
                <div key={a.fingerprint} className="small row between"><span>{short(a.txn_date)} · {a.payee ?? '—'}{a.ref_no && /^\d+$/.test(a.ref_no) ? ` · #${a.ref_no}` : ''}</span><span className="num">{usd(a.amount)}</span></div>
              ))}
            </div>
            <div style={{ flex: '1 1 260px' }}>
              <div className="small"><strong>Cleared, will drop off ({pv.cleared!.length})</strong></div>
              {pv.cleared!.length === 0 ? <div className="small muted">None.</div> : pv.cleared!.map((c, i) => (
                <div key={i} className="small row between"><span>{short(c.txn_date)} · {c.payee ?? '—'}</span><span className="num">{usd(c.amount)}</span></div>
              ))}
            </div>
          </div>
          {pv.kept! > 0 && <span className="small muted">{pv.kept} already listed stay as they are.</span>}
          {s.olderCount > 0 && <span className="small muted">{s.olderCount} uncleared payments dated before tracking started are left out.</span>}
          <form action={save}>
            <input type="hidden" name="payload" value={pv.payload} />
            <button className="btn" type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</button>
          </form>
        </div>
      )}
      {saved.error && <div className="notice bad">{saved.error}</div>}
      {saved.ok && <div className="notice good">{saved.ok}</div>}
    </section>
  );
}
