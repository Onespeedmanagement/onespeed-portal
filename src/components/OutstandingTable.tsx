import { money } from '@/lib/format';
import type { Outstanding } from '@/lib/qb/outstanding';

const short = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });

// Outstanding (not yet cleared) payments from the QuickBooks register upload
export function OutstandingTable({ items, date }: { items: Outstanding[]; date: string }) {
  const total = items.reduce((a, i) => a + i.amount, 0);
  return (
    <div className="scroll">
      <div className="small muted" style={{ marginBottom: 6 }}>Outstanding payments in QuickBooks as of {short(date)}</div>
      <table className="num" style={{ minWidth: 480 }}>
        <thead><tr><th>Payee</th><th>Date</th><th>Check #</th><th className="r">Amount</th></tr></thead>
        <tbody>
          {items.length === 0 && <tr><td colSpan={4} className="muted small">No QuickBooks register uploaded for this day yet.</td></tr>}
          {items.map((i) => (
            <tr key={i.id}>
              <td>{i.payee ?? '—'}{i.txn_date > date ? <span className="small muted"> · dated {short(i.txn_date)}</span> : null}</td>
              <td>{short(i.txn_date)}</td>
              <td>{i.ref_no && /^\d+$/.test(i.ref_no) ? i.ref_no : <span className="muted small">{i.ref_no ?? '—'}</span>}</td>
              <td className="r">{money(i.amount)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={3}><strong>Total</strong></td><td className="r"><strong>{money(total)}</strong></td></tr></tfoot>
      </table>
    </div>
  );
}
