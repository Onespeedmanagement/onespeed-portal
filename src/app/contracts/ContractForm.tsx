'use client';
import { useActionState, useState } from 'react';
import { createContract, updateContract, type ContractState } from './actions';
import { CATEGORIES, type Contract } from '@/lib/contracts';

type Opt = { id: string; name: string };

export function ContractForm({ contract, businesses, admins, defaultRemind, portfolioId, allLabel }: { contract?: Contract; businesses: Opt[]; admins: { email: string; name: string }[]; defaultRemind: string[]; portfolioId: string | null; allLabel: string }) {
  const [state, action, pending] = useActionState<ContractState, FormData>(contract ? updateContract : createContract, {});
  const known = (CATEGORIES as readonly string[]).includes(contract?.category ?? '');
  const [cat, setCat] = useState(contract ? (known ? contract.category : 'Other') : 'Insurance');
  const [auto, setAuto] = useState(contract?.auto_renews ?? true);
  const remind = contract?.remind_emails ?? defaultRemind;
  return (
    <form action={action} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {contract && <input type="hidden" name="id" value={contract.id} />}
      <input type="hidden" name="portfolio_id" value={contract?.portfolio_id ?? portfolioId ?? ''} />
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <div className="field"><label htmlFor="category">Type</label>
          <select id="category" name="category" value={cat} onChange={(e) => setCat(e.target.value)}>
            {CATEGORIES.map((c) => <option key={c}>{c}</option>)}
          </select></div>
        {cat === 'Other' && <div className="field"><label htmlFor="category_other">What kind?</label>
          <input id="category_other" name="category_other" type="text" defaultValue={known ? '' : contract?.category} placeholder="e.g. Linen service" /></div>}
        <div className="field"><label htmlFor="vendor">Vendor / landlord</label>
          <input id="vendor" name="vendor" type="text" defaultValue={contract?.vendor} required placeholder="e.g. Waste Management" /></div>
        <div className="field"><label htmlFor="business_id">For</label>
          <select id="business_id" name="business_id" defaultValue={contract?.business_id ?? ''}>
            <option value="">{allLabel}</option>
            {businesses.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </select></div>
        <div className="field" style={{ gridColumn: '1 / -1' }}><label htmlFor="description">What it covers (optional)</label>
          <input id="description" name="description" type="text" defaultValue={contract?.description ?? ''} placeholder="e.g. General liability + liquor liability, policy #…" /></div>
        <div className="field"><label htmlFor="start_date">Start date (optional)</label>
          <input id="start_date" name="start_date" type="date" defaultValue={contract?.start_date ?? ''} /></div>
        <div className="field"><label htmlFor="end_date">Current term ends / renews on</label>
          <input id="end_date" name="end_date" type="date" defaultValue={contract?.end_date} required /></div>
        <div className="field"><label htmlFor="notice_days">Notice needed to cancel (days before end)</label>
          <input id="notice_days" name="notice_days" type="number" min={0} max={730} defaultValue={contract?.notice_days ?? 30} required /></div>
        <div className="field" style={{ justifyContent: 'flex-end' }}>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontWeight: 400 }}>
            <input type="checkbox" name="auto_renews" checked={auto} onChange={(e) => setAuto(e.target.checked)} style={{ width: 18, height: 18 }} />
            Renews automatically if not cancelled
          </label></div>
        {auto && <div className="field"><label htmlFor="renewal_months">Each renewal lasts (months)</label>
          <input id="renewal_months" name="renewal_months" type="number" min={1} max={120} defaultValue={contract?.renewal_months ?? 12} /></div>}
        <div className="field"><label htmlFor="cost">Cost (optional)</label>
          <input id="cost" name="cost" type="text" inputMode="decimal" defaultValue={contract?.cost ?? ''} placeholder="0.00" /></div>
        <div className="field"><label htmlFor="cost_period">Per</label>
          <select id="cost_period" name="cost_period" defaultValue={contract?.cost_period ?? 'month'}>
            <option value="month">Month</option><option value="quarter">Quarter</option><option value="year">Year</option><option value="one-time">One-time</option>
          </select></div>
      </div>
      <fieldset style={{ border: 0, padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
        <legend style={{ fontWeight: 500, fontSize: 14, marginBottom: 6 }}>Email the reminder to</legend>
        <div className="row">
          {admins.map((a) => (
            <label key={a.email} style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '8px 12px', border: '1px solid #d8cfb6', borderRadius: 8, fontWeight: 400 }}>
              <input type="checkbox" name="remind_emails" value={a.email} defaultChecked={remind.includes(a.email)} style={{ width: 18, height: 18 }} />{a.name}
            </label>
          ))}
        </div>
        <span className="small muted">They get an email 30 days and 7 days before the notice deadline.</span>
      </fieldset>
      <div className="field"><label htmlFor="notes">Notes (optional)</label>
        <textarea id="notes" name="notes" rows={2} defaultValue={contract?.notes ?? ''} placeholder="Contact person, how to cancel (letter / email / phone), account number…" /></div>
      <div className="row">
        <button className="btn" type="submit" disabled={pending}>{pending ? 'Saving…' : contract ? 'Save changes' : 'Save contract'}</button>
        {!contract && <span className="small muted">You can upload the contract file on the next screen.</span>}
      </div>
      {state.error && <div className="notice bad">{state.error}</div>}
      {state.ok && <div className="notice good">{state.ok}</div>}
    </form>
  );
}
