import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { todayNY } from '@/lib/dates';
import { PrintButton } from '../Forms';

export const dynamic = 'force-dynamic';

// One clean page for the break room / register: the manager's focus items
export default async function FocusPrint({ searchParams }: { searchParams: Promise<{ store?: string }> }) {
  await requireRole('admin', 'manager');
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const { data: stores } = await supabase.from('stores').select('id, name').eq('active', true).order('name');
  const store = stores?.find((s) => s.id === sp.store) ?? stores?.[0];
  const { data } = store ? await supabase.from('unsold_items').select('sku, description, kind, stock, price').eq('business_id', store.id).eq('focus', true) : { data: [] };
  const items = (data ?? []).map((i) => ({ ...i, price: i.price == null ? null : Number(i.price) })).sort((a, b) => String(a.kind).localeCompare(String(b.kind)) || a.description.localeCompare(b.description));
  const kinds = [...new Set(items.map((i) => i.kind))];
  const day = new Date(`${todayNY()}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
  return (
    <main style={{ maxWidth: 820, margin: '0 auto', padding: 24, background: '#fff', minHeight: '100vh' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', borderBottom: '3px solid #1f3d2b', paddingBottom: 8 }}>
        <div><div style={{ fontSize: 14, color: '#4f5550' }}>{store?.name} · {day}</div><h1 style={{ margin: 0, fontSize: 32 }}>Items to push</h1></div>
        <PrintButton />
      </div>
      <p style={{ fontSize: 15 }}>Recommend these to customers today. Mention them at the register and point them out on the shelf.</p>
      {items.length === 0 && <p>No focus items picked yet.</p>}
      {kinds.map((k) => (
        <section key={k} style={{ marginTop: 18 }}>
          <h2 style={{ fontSize: 20, margin: '0 0 6px', color: '#1f3d2b' }}>{k}</h2>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 17 }}>
            <tbody>{items.filter((i) => i.kind === k).map((i) => (
              <tr key={i.sku} style={{ borderBottom: '1px solid #ddd' }}>
                <td style={{ padding: '8px 4px', width: 28 }}>☐</td>
                <td style={{ padding: '8px 4px' }}><strong>{i.description}</strong></td>
                <td style={{ padding: '8px 4px', textAlign: 'right', whiteSpace: 'nowrap' }}>{i.price != null ? `$${i.price.toFixed(2)}` : ''}</td>
              </tr>
            ))}</tbody>
          </table>
        </section>
      ))}
    </main>
  );
}
