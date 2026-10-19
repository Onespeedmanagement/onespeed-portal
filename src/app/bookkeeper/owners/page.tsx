import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { BookkeeperNav } from '@/components/BookkeeperNav';
import { SalesAndCash, LedgerTable } from '@/components/OwnersDay';
import { loadOwnersDay } from '@/lib/owners';
import { getTolerance } from '@/lib/closeouts';
import { addDays, todayNY } from '@/lib/dates';
import { longDate } from '@/lib/format';
import { BalanceForm, LineForm } from './Forms';
import { deleteLine } from './actions';
import { QbImport } from './QbImport';
import { OutstandingTable } from '@/components/OutstandingTable';
import { loadOutstanding } from '@/lib/qb/outstanding';

export const dynamic = 'force-dynamic';

export default async function OwnersEntryPage({ searchParams }: { searchParams: Promise<{ store?: string; date?: string }> }) {
  const me = await requireRole('bookkeeper');
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const { data: stores } = await supabase.from('stores').select('id, name').eq('active', true).order('name');
  const store = stores?.find((s) => s.id === sp.store) ?? stores?.[0];
  const date = sp.date && /^\d{4}-\d{2}-\d{2}$/.test(sp.date) ? sp.date : addDays(todayNY(), -1);
  const tolerance = await getTolerance(supabase);
  const day = store ? await loadOwnersDay(supabase, store.id, date) : null;
  const { data: distributors } = await supabase.from('distributors').select('id, name').order('name');
  const outstanding = store ? await loadOutstanding(supabase, store.id, date) : [];

  return (
    <>
      <TopBar subtitle="Bookkeeping" who={`${me.email} · Bookkeeper`} />
      <BookkeeperNav active="/bookkeeper/owners" />
      <main className="page" style={{ maxWidth: 1240 }}>
        <div className="row between">
          <div>
            <div className="eyebrow">Bookkeeper entry · owners see this</div>
            <h1>Owners Report</h1>
            <span className="small muted">Upload the QuickBooks register each day; the balance and outstanding payments fill in. Other lines can still be added by hand.</span>
          </div>
          <form className="row" method="get">
            <select name="store" defaultValue={store?.id} aria-label="Store" style={{ width: 'auto' }}>
              {(stores ?? []).map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
            <input type="date" name="date" defaultValue={date} aria-label="Date of business" style={{ width: 'auto' }} />
            <button className="btn secondary" type="submit">Open</button>
          </form>
        </div>
        {store && day && (
          <div className="row" style={{ alignItems: 'flex-start', gap: 16 }}>
            <section className="card" style={{ flex: '1 1 300px', background: '#fbf8ef' }}>
              <h2 style={{ fontSize: 22, marginBottom: 6 }}>{store.name}</h2>
              <div className="small muted" style={{ marginBottom: 8 }}>{longDate(date)} · filled in automatically</div>
              <SalesAndCash day={day} tolerance={tolerance} />
            </section>
            <section className="card" style={{ flex: '2 1 560px', minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <QbImport businessId={store.id} date={date} dateLabel={longDate(date)} />
              <OutstandingTable items={outstanding} date={date} />
              <BalanceForm businessId={store.id} date={date} balance={day.rep?.qb_balance ?? null} status={day.rep?.balance_status ?? 'good'} />
              <LedgerTable day={day} onDelete={(id) => (
                <form action={deleteLine}><input type="hidden" name="id" value={id} />
                  <button className="btn danger" type="submit" aria-label="Remove line" style={{ minHeight: 34, padding: '4px 10px' }}>✕</button></form>
              )} />
              <LineForm businessId={store.id} date={date} distributors={distributors ?? []} />
              <span className="small muted">Only accounting@ can enter or change these. Owners see them on their Owners Report right away.</span>
            </section>
          </div>
        )}
      </main>
    </>
  );
}
