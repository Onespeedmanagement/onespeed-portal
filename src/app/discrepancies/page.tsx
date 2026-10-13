import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { AdminNav } from '@/components/AdminNav';
import { HolidayTag } from '@/components/HolidayTag';
import { money, signedMoney } from '@/lib/format';
import { addDays, shortDate, todayNY } from '@/lib/dates';
import { getTolerance } from '@/lib/closeouts';
import { resolveItem } from './actions';

export const dynamic = 'force-dynamic';

type Item = {
  key: string; kind: 'short' | 'over' | 'missing_closeout' | 'file' | 'question' | 'override' | 'changed';
  businessId: string; store: string; date: string; ref: string;
  title: string; detail: string; meta?: string;
};

const PILL: Record<Item['kind'], [string, string]> = {
  question: ['', 'Bookkeeper question'],
  short: ['bad', 'Short'],
  over: ['warn', 'Over'],
  missing_closeout: ['bad', 'Missed close-out'],
  file: ['bad', 'POS file problem'],
  override: ['warn', 'Saved anyway'],
  changed: ['warn', 'Numbers changed'],
};

export default async function DiscrepanciesPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const me = await requireRole('admin');
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const days = [7, 14, 30].includes(Number(sp.days)) ? Number(sp.days) : 14;
  const to = addDays(todayNY(), -1);
  const from = addDays(to, -(days - 1));
  const tolerance = await getTolerance(supabase);

  const [{ data: stores }, { data: cos }, { data: pos }, { data: files }, { data: qs }, { data: res }, { data: changes }] = await Promise.all([
    supabase.from('businesses').select('id, name'),
    supabase.from('closeout_results').select('id, business_id, business_date, difference, cash_counted, cash_sales, submitted_by, note').gte('business_date', from).lte('business_date', to),
    supabase.from('pos_daily').select('business_id, business_date, override_note, override_by, total_sales, cash_sales').gte('business_date', from).lte('business_date', to),
    supabase.from('pos_files').select('id, business_id, business_date, filename, status, message, received_at').in('status', ['held', 'unknown_store', 'error']).gte('received_at', `${from}T00:00:00Z`),
    supabase.from('questions').select('id, business_id, business_date, body, asked_by, asked_at').eq('resolved', false),
    supabase.from('resolutions').select('business_id, business_date, kind, ref'),
    supabase.from('pos_changes').select('id, business_id, business_date, changed_by, changed_at, before, after, kind').gte('changed_at', `${from}T00:00:00Z`).order('changed_at', { ascending: false }),
  ]);
  const storeName = (id: string | null) => stores?.find((s) => s.id === id)?.name ?? 'Unknown store';
  const resolved = new Set((res ?? []).map((r) => `${r.kind}|${r.business_id}|${r.business_date}|${r.ref}`));

  const ids = (cos ?? []).map((c) => c.id);
  const { data: emps } = ids.length ? await supabase.from('closeout_employees').select('closeout_id, employees(name)').in('closeout_id', ids) : { data: [] };
  const who = (id: string) => ((emps ?? []) as unknown as { closeout_id: string; employees: { name: string } | null }[])
    .filter((e) => e.closeout_id === id).map((e) => e.employees?.name).filter(Boolean).join(', ');

  const items: Item[] = [];
  for (const q of qs ?? []) items.push({ key: `q${q.id}`, kind: 'question', businessId: q.business_id, store: storeName(q.business_id), date: q.business_date, ref: q.id,
    title: `“${q.body}”`, detail: '', meta: `From ${q.asked_by}` });
  for (const c of cos ?? []) {
    if (c.difference == null || Math.abs(c.difference) <= tolerance) continue;
    const kind = c.difference < 0 ? 'short' : 'over';
    if (resolved.has(`${kind}|${c.business_id}|${c.business_date}|`)) continue;
    items.push({ key: `c${c.id}`, kind, businessId: c.business_id, store: storeName(c.business_id), date: c.business_date, ref: '',
      title: `${kind === 'short' ? 'Short' : 'Over'} ${signedMoney(c.difference)}`,
      detail: `Counted ${money(c.cash_counted)} vs POS cash ${money(c.cash_sales)}. ${who(c.id) ? `Assigned to ${who(c.id)}.` : 'No employee picked.'}`,
      meta: `Submitted by ${c.submitted_by}${c.note ? ` · “${c.note}”` : ''}` });
  }
  for (const p of pos ?? []) {
    if (!p.override_note || resolved.has(`override|${p.business_id}|${p.business_date}|`)) continue;
    items.push({ key: `o${p.business_id}${p.business_date}`, kind: 'override', businessId: p.business_id, store: storeName(p.business_id), date: p.business_date, ref: '',
      title: `POS report saved although its totals don't add up · sales ${money(p.total_sales)} · cash ${money(p.cash_sales)}`,
      detail: p.override_note, meta: `Check the numbers against the printout and fix by hand if needed. Saved by ${p.override_by}` });
  }
  const delta = (label: string, b: number | undefined, a: number | undefined) =>
    Number(b ?? 0) === Number(a ?? 0) ? null : `${label} ${money(b)} → ${money(a)}`;
  for (const c of changes ?? []) {
    if (resolved.has(`changed|${c.business_id}|${c.business_date}|${c.id}`)) continue;
    const b = c.before as Record<string, number> | null, a = c.after as Record<string, number> | null;
    const parts = (c.kind === 'cash'
      ? [delta('cash counted', b?.cash_counted, a?.cash_counted), delta('paid out', b?.paid_out, a?.paid_out), delta('petty change', b?.petty_change, a?.petty_change), delta('held', b?.held_for_next, a?.held_for_next)]
      : [delta('sales', b?.total_sales, a?.total_sales), delta('cash', b?.cash_sales, a?.cash_sales), delta('card', b?.card_sales, a?.card_sales)]).filter(Boolean);
    items.push({ key: `x${c.id}`, kind: 'changed', businessId: c.business_id, store: storeName(c.business_id), date: c.business_date, ref: c.id,
      title: `${c.kind === 'cash' ? 'Cash close-out changed: ' : ''}${parts.length ? parts.join(' · ') : 'Report replaced (same totals)'}`,
      detail: (a as { reason?: string } | null)?.reason ? `Typed in by hand. Reason: “${(a as { reason?: string }).reason}”` : 'The bookkeeper uploaded a new POS report for this day, replacing the earlier one.',
      meta: `Changed by ${c.changed_by} · ${new Date(c.changed_at).toLocaleString('en-US', { timeZone: 'America/New_York', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}` });
  }
  const closedSet = new Set((cos ?? []).map((c) => `${c.business_id}|${c.business_date}`));
  for (const p of pos ?? []) {
    if (closedSet.has(`${p.business_id}|${p.business_date}`)) continue;
    if (resolved.has(`missing_closeout|${p.business_id}|${p.business_date}|`)) continue;
    items.push({ key: `m${p.business_id}${p.business_date}`, kind: 'missing_closeout', businessId: p.business_id, store: storeName(p.business_id), date: p.business_date, ref: '',
      title: 'No close-out entered', detail: 'The POS report is in, but no one entered the cash count for this day.' });
  }
  for (const f of files ?? []) {
    if (resolved.has(`file|${f.business_id}|${f.business_date}|${f.id}`)) continue;
    items.push({ key: `f${f.id}`, kind: 'file', businessId: f.business_id, store: storeName(f.business_id), date: f.business_date ?? f.received_at.slice(0, 10), ref: f.id,
      title: f.filename, detail: f.message ?? '' });
  }
  const order = { question: 0, changed: 1, override: 2, file: 3, missing_closeout: 4, short: 5, over: 6 };
  items.sort((a, b) => order[a.kind] - order[b.kind] || b.date.localeCompare(a.date));

  return (
    <>
      <TopBar subtitle="Management Portal" who={`${me.email} · Admin`} />
      <AdminNav active="/discrepancies" />
      <main className="page">
        <div className="row between">
          <div>
            <div className="eyebrow">Admins only · check daily</div>
            <h1>Discrepancies</h1>
            <span className="small muted">Shorts, overs, missed close-outs, POS file problems, reports saved anyway and bookkeeper questions from every store.</span>
          </div>
          <form className="row" method="get">
            <select name="days" defaultValue={String(days)} aria-label="Range" style={{ width: 'auto' }}>
              {[7, 14, 30].map((d) => <option key={d} value={d}>Last {d} days</option>)}
            </select>
            <button className="btn secondary" type="submit">Show</button>
          </form>
        </div>
        {items.length === 0 && <div className="notice good">✓ Nothing open. Every store matched in the last {days} days.</div>}
        {items.map((it) => (
          <article key={it.key} className="card" style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', padding: '16px 20px' }}>
            <div style={{ flex: '1 1 380px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div className="row" style={{ gap: 8 }}>
                <span className={`pill ${PILL[it.kind][0]}`} style={it.kind === 'question' ? { background: '#e3e8f2', color: '#2b3e66' } : undefined}>{PILL[it.kind][1]}</span>
                <strong>{it.store} · {shortDate(it.date)}</strong><HolidayTag date={it.date} />
              </div>
              <div className="num">{it.title}</div>
              {it.detail && <div className="small">{it.detail}</div>}
              {it.meta && <div className="small muted">{it.meta}</div>}
            </div>
            <form action={resolveItem} className="row" style={{ flex: '0 1 360px' }}>
              <input type="hidden" name="kind" value={it.kind} />
              <input type="hidden" name="business_id" value={it.businessId ?? ''} />
              <input type="hidden" name="business_date" value={it.date} />
              <input type="hidden" name="ref" value={it.ref} />
              <input type="text" name="note" placeholder={it.kind === 'question' ? 'Answer for the bookkeeper' : 'Note (optional)'} aria-label="Note" style={{ flex: '1 1 160px', width: 'auto' }} />
              <button className="btn" type="submit">Resolve</button>
            </form>
          </article>
        ))}
      </main>
    </>
  );
}
