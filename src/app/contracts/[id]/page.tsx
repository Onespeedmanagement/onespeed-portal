import { notFound } from 'next/navigation';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';
import { TopBar } from '@/components/TopBar';
import { AdminNav } from '@/components/AdminNav';
import { RoleNav } from '@/components/RoleNav';
import { contractScope } from '@/lib/contractScope';
import { todayNY } from '@/lib/dates';
import { currentTerm, type Contract } from '@/lib/contracts';
import { ContractForm } from '../ContractForm';
import { FileUpload } from '../FileUpload';
import { deleteFile, setStatus } from '../actions';
import { DeleteButton } from '../DeleteButton';

export const dynamic = 'force-dynamic';
const nice = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

export default async function ContractPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ saved?: string }> }) {
  const me = await requireRole('admin', 'school_admin');
  const { id } = await params;
  const sp = await searchParams;
  const supabase = await supabaseServer();
  const [{ data: row }, { data: files }] = await Promise.all([
    supabase.from('contracts').select('*').eq('id', id).maybeSingle(),
    supabase.from('contract_files').select('id, filename, uploaded_by, uploaded_at').eq('contract_id', id).order('uploaded_at'),
  ]);
  if (!row) notFound();
  const { data: pf } = row.portfolio_id ? await supabase.from('portfolios').select('kind').eq('id', row.portfolio_id).maybeSingle() : { data: null };
  const school = pf?.kind === 'school';
  const scope = await contractScope(supabase, school);
  const c = { ...(row as Contract), cost: row.cost == null ? null : Number(row.cost) };
  const t = currentTerm(c, todayNY());

  return (
    <>
      <TopBar subtitle="Management Portal" who={`${me.email} · ${me.role === 'admin' ? 'Admin' : 'Goddard admin'}`} />
      {school ? <RoleNav role={me.role} active="/goddard/contracts" /> : <AdminNav active="/contracts" />}
      <main className="page" style={{ maxWidth: 1000 }}>
        <div>
          <Link href={scope.base} className="small">← All {school ? 'Goddard ' : ''}contracts</Link>
          <div className="eyebrow" style={{ marginTop: 8 }}>{c.category}</div>
          <h1>{c.vendor}</h1>
        </div>
        {sp.saved && <div className="notice good">✓ Contract saved. Upload the signed contract below.</div>}

        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {c.status === 'active' ? (
            <>
              <div className={`notice ${t.daysToNotice <= 30 ? 'bad' : 'good'}`}>
                <strong>Notice deadline: {nice(t.notice)}</strong>{' '}
                ({t.daysToNotice < 0 ? `passed ${-t.daysToNotice} days ago` : t.daysToNotice === 0 ? 'today' : `in ${t.daysToNotice} days`}).
                {' '}To cancel or renegotiate, give notice by then. The current term ends {nice(t.end)}{c.auto_renews ? `, then it renews for ${c.renewal_months} months` : ''}.
              </div>
              <span className="small muted">Reminders go to {c.remind_emails.join(', ') || 'nobody (pick someone below)'} 30 and 7 days before the notice deadline.</span>
            </>
          ) : <div className="notice">This contract is marked <strong>{c.status}</strong>. No reminders are sent.</div>}
          <div className="row">
            {c.status === 'active' ? (
              <>
                <form action={setStatus}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="cancelled" />
                  <button className="btn secondary" type="submit">Mark cancelled</button></form>
                <form action={setStatus}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="ended" />
                  <button className="btn secondary" type="submit">Mark ended</button></form>
              </>
            ) : (
              <form action={setStatus}><input type="hidden" name="id" value={c.id} /><input type="hidden" name="status" value="active" />
                <button className="btn secondary" type="submit">Make active again</button></form>
            )}
          </div>
          <span className="small muted">Renewed on new terms? Edit the end date (and cost) below; reminders follow the new date.</span>
        </section>

        <section className="card" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2>Contract files</h2>
          {(files ?? []).length === 0 ? <p className="muted small">No file uploaded yet.</p> : (
            <table><tbody>
              {(files ?? []).map((f) => (
                <tr key={f.id}>
                  <td><a href={`/contracts/file/${f.id}`} target="_blank" rel="noreferrer">📎 {f.filename}</a></td>
                  <td className="small muted">{f.uploaded_by} · {new Date(f.uploaded_at).toLocaleDateString('en-US', { timeZone: 'America/New_York' })}</td>
                  <td className="r"><form action={deleteFile}><input type="hidden" name="file_id" value={f.id} />
                    <button className="btn danger" type="submit" style={{ minHeight: 34, padding: '4px 10px' }} aria-label={`Remove ${f.filename}`}>✕</button></form></td>
                </tr>
              ))}
            </tbody></table>
          )}
          <FileUpload contractId={c.id} />
        </section>

        <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <h2>Details</h2>
          <ContractForm contract={c} businesses={scope.businesses} admins={scope.people} defaultRemind={[me.email]} portfolioId={scope.defaultPortfolio} allLabel={scope.allLabel} />
        </section>

        <DeleteButton id={c.id} vendor={c.vendor} back={school ? 'goddard' : undefined} />
      </main>
    </>
  );
}
