import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { BookkeeperNav } from '@/components/BookkeeperNav';
import { addDays, todayNY } from '@/lib/dates';
import { longDate } from '@/lib/format';
import { EditForm } from './EditForm';
import { CashForm } from './CashForm';

export const dynamic = 'force-dynamic';

export default async function EditDayPage({ searchParams }: { searchParams: Promise<{ store?: string; date?: string }> }) {
  const me = await requireRole('bookkeeper');
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const { data: stores } = await supabase.from('stores').select('id, name').eq('active', true).order('name');
  const store = stores?.find((s) => s.id === sp.store) ?? stores?.[0];
  const yesterday = addDays(todayNY(), -1);
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) && sp.date <= yesterday ? sp.date : yesterday;
  const { data: current } = store
    ? await supabase.from('pos_daily').select('total_sales, card_sales, cash_sales, transactions, override_note').eq('business_id', store.id).eq('business_date', date).maybeSingle()
    : { data: null };
  const { data: co } = store
    ? await supabase.from('closeouts').select('cash_counted, paid_out, paid_out_reason, petty_change, held_for_next, submitted_by').eq('business_id', store.id).eq('business_date', date).maybeSingle()
    : { data: null };
  return (
    <>
      <TopBar subtitle="Bookkeeping" who={`${me.email} · Bookkeeper`} />
      <BookkeeperNav active="/bookkeeper" />
      <main className="page" style={{ maxWidth: 900 }}>
        <div className="row between">
          <div>
            <a href={`/bookkeeper?store=${store?.id ?? ''}`} className="small">← Daily entries</a>
            <div className="eyebrow" style={{ marginTop: 8 }}>Correct a day&apos;s sales or cash</div>
            <h1>{store?.name} · {longDate(date)}</h1>
          </div>
          <form className="row" method="get">
            <select name="store" defaultValue={store?.id} aria-label="Store" style={{ width: 'auto' }}>
              {(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="date" name="date" defaultValue={date} max={yesterday} aria-label="Day" style={{ width: 'auto' }} />
            <button className="btn secondary" type="submit">Open</button>
          </form>
        </div>
        {!current && <div className="notice warn">No POS report for this day yet. Entering numbers here creates the day.</div>}
        {current?.override_note && <div className="notice warn">Last change: {current.override_note}</div>}
        <h2>Sales (from the POS report)</h2>
        {store && <EditForm key={`${store.id}${date}`} businessId={store.id} date={date} current={current} />}
        {store && <CashForm key={`c${store.id}${date}`} businessId={store.id} date={date} current={co} posCash={current?.cash_sales != null ? Number(current.cash_sales) : null} />}
      </main>
    </>
  );
}
