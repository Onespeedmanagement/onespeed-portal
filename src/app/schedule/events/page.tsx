import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { ManagerNav } from '@/components/ManagerNav';
import { todayNY } from '@/lib/dates';
import { KIND_LABEL, type LocalEvent } from '@/lib/localEvents';
import { addEvent, deleteEvent, saveUdStores } from './actions';

export const dynamic = 'force-dynamic';
const short = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export default async function LocalEvents({ searchParams }: { searchParams: Promise<{ ok?: string; err?: string; past?: string }> }) {
  const me = await requireRole('admin');
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const [{ data: rows }, { data: stores }] = await Promise.all([
    supabase.from('local_events').select('id, start_date, end_date, name, kind, detail, scope, source').order('start_date'),
    supabase.from('stores').select('id, name, ud_area').eq('active', true).order('name'),
  ]);
  const today = todayNY();
  const all = (rows ?? []) as LocalEvent[];
  const list = sp.past ? all : all.filter((e) => e.end_date >= today);
  return (
    <>
      <TopBar subtitle="Management Portal" who={`${me.email} · Admin`} />
      <ManagerNav active="/schedule" admin />
      <main className="page" style={{ maxWidth: 1100 }}>
        <div className="row between">
          <div><h1>Local events</h1><span className="small muted">Dates the Schedule Assistant warns managers about. Holidays are built in; add anything else that brings in (or keeps away) customers.</span></div>
          <a className="btn secondary" href="/schedule" style={{ textDecoration: 'none' }}>Back to Schedule Assistant</a>
        </div>
        {sp.ok && <div className="notice good">✓ {sp.ok === 'added' ? 'Event added.' : sp.ok === 'removed' ? 'Event removed.' : 'Stores saved.'}</div>}
        {sp.err && <div className="notice bad">{sp.err === '1' ? 'Fill in a name, a start date, and an end date on or after it.' : sp.err}</div>}

        <section className="card">
          <h2 style={{ marginBottom: 6 }}>{sp.past ? 'All events' : 'Upcoming events'} <span className="small muted">· {list.length}</span></h2>
          <table className="small" style={{ width: '100%' }}>
            <thead><tr><th>Dates</th><th>Event</th><th>Type</th><th>Stores</th><th>Source</th><th /></tr></thead>
            <tbody>{list.map((e) => (
              <tr key={e.id}>
                <td style={{ whiteSpace: 'nowrap' }}>{e.start_date === e.end_date ? short(e.start_date) : `${short(e.start_date)} – ${short(e.end_date)}`}</td>
                <td><strong>{e.name}</strong>{e.detail && <div className="muted">{e.detail}</div>}</td>
                <td>{KIND_LABEL[e.kind]}</td>
                <td>{e.scope === 'ud' ? 'Near UD' : 'All stores'}</td>
                <td className="muted">{e.source}</td>
                <td className="r"><form action={deleteEvent}><input type="hidden" name="id" value={e.id} /><button className="link small" type="submit">Remove</button></form></td>
              </tr>
            ))}</tbody>
          </table>
          <a className="small" href={sp.past ? '/schedule/events' : '/schedule/events?past=1'}>{sp.past ? 'Hide past events' : 'Show past events too (the portal measures their effect on sales)'}</a>
        </section>

        <form action={addEvent} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2>Add an event</h2>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '2 1 240px' }}><label htmlFor="n">Name</label><input id="n" name="name" required placeholder="e.g. UD basketball vs Drexel" /></div>
            <div className="field" style={{ flex: '1 1 150px' }}><label htmlFor="s">Starts</label><input id="s" name="start_date" type="date" required /></div>
            <div className="field" style={{ flex: '1 1 150px' }}><label htmlFor="e">Ends (blank = one day)</label><input id="e" name="end_date" type="date" /></div>
          </div>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <div className="field" style={{ flex: '1 1 200px' }}><label htmlFor="k">Type</label>
              <select id="k" name="kind" defaultValue="campus">
                <option value="game">Home game (busier)</option><option value="homecoming">Homecoming (much busier)</option><option value="family">Family weekend (busier)</option>
                <option value="campus">Campus / local event (busier)</option><option value="away">Students away / break (slower)</option><option value="note">Good to know (no change)</option>
              </select></div>
            <div className="field" style={{ flex: '1 1 160px' }}><label htmlFor="sc">Stores</label>
              <select id="sc" name="scope" defaultValue="ud"><option value="ud">Stores near UD</option><option value="all">All stores</option></select></div>
            <div className="field" style={{ flex: '2 1 240px' }}><label htmlFor="d">Details (optional)</label><input id="d" name="detail" placeholder="e.g. Sat 2 pm tip-off" /></div>
            <button className="btn" type="submit">Add</button>
          </div>
        </form>

        <form action={saveUdStores} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <h2>Stores near the University of Delaware</h2>
          <span className="small muted">These stores get the UD dates (classes, breaks, home games, Family Weekend, Homecoming). Every store gets holidays.</span>
          <div className="row">{(stores ?? []).map((s) => (
            <label key={s.id} className="row small" style={{ gap: 6 }}><input type="checkbox" name="ud" value={s.id} defaultChecked={!!s.ud_area} style={{ width: 'auto' }} />{s.name}</label>
          ))}</div>
          <div><button className="btn secondary" type="submit">Save</button></div>
        </form>
      </main>
    </>
  );
}
