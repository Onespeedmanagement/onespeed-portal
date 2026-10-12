import { money, signedMoney } from '@/lib/format';
import { LINE_TYPES, type loadOwnersDay } from '@/lib/owners';

type Day = Awaited<ReturnType<typeof loadOwnersDay>>;

export function SalesAndCash({ day, tolerance }: { day: Day; tolerance: number }) {
  const { pos, co } = day;
  const diff = co?.difference ?? null;
  return (
    <table className="num"><tbody>
      <tr><td><strong>Total sales</strong></td><td className="r"><strong>{money(pos?.total_sales)}</strong></td></tr>
      <tr><td>Profit{pos?.profit_pct != null ? ` · ${pos.profit_pct}%` : ''}</td><td className="r">{money(pos?.profit)}</td></tr>
      <tr><td>Credit card</td><td className="r">{money(pos?.card_sales)}</td></tr>
      <tr><td>Cash (net cash-flow)</td><td className="r">{money(pos?.cash_sales)}</td></tr>
      <tr><td>Cash deposited</td><td className="r">{co ? money(co.deposit_amount) : '—'}</td></tr>
      {co?.petty_change ? <tr><td>Petty change taken</td><td className="r">{money(co.petty_change)}</td></tr> : null}
      {co?.paid_out ? <tr><td>Paid out{co.paid_out_reason ? ` · ${co.paid_out_reason}` : ''}</td><td className="r">{money(co.paid_out)}</td></tr> : null}
      <tr><td>Difference {diff == null ? null : Math.abs(diff) <= tolerance ? <span className="pill good">✓ Matched</span> : diff < 0 ? <span className="pill bad">✕ Short</span> : <span className="pill warn">▲ Over</span>}</td>
        <td className="r">{diff == null ? (co ? 'Waiting for POS' : 'No close-out') : signedMoney(diff)}</td></tr>
    </tbody></table>
  );
}

export function LedgerTable({ day, onDelete }: { day: Day; onDelete?: (id: string) => React.ReactNode }) {
  return (
    <div className="scroll">
      <table className="num" style={{ minWidth: 560 }}>
        <thead><tr><th>Memo</th><th>Type</th><th>Check #</th><th>Check date</th><th className="r">Debit</th><th className="r">Credit</th>{onDelete && <th />}</tr></thead>
        <tbody>
          {day.lines.length === 0 && <tr><td colSpan={7} className="muted small">No payments entered for this day.</td></tr>}
          {day.lines.map((l) => (
            <tr key={l.id}>
              <td>{l.distributors?.name ?? l.memo}</td><td>{LINE_TYPES[l.line_type] ?? l.line_type}</td>
              <td>{l.check_number ?? '—'}</td><td>{l.check_date ?? '—'}</td>
              <td className="r">{Number(l.debit) ? money(l.debit) : '—'}</td><td className="r">{Number(l.credit) ? money(l.credit) : '—'}</td>
              {onDelete && <td className="r">{onDelete(l.id)}</td>}
            </tr>
          ))}
        </tbody>
        <tfoot><tr><td colSpan={4}><strong>Total</strong></td><td className="r"><strong>{money(day.totals.debit)}</strong></td><td className="r"><strong>{money(day.totals.credit)}</strong></td>{onDelete && <td />}</tr></tfoot>
      </table>
    </div>
  );
}
