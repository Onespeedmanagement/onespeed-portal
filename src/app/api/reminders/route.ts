import { NextResponse } from 'next/server';
import { secretOk, supabaseService } from '@/lib/supabase/service';
import { todayNY } from '@/lib/dates';
import { currentTerm, type Contract } from '@/lib/contracts';

export const runtime = 'nodejs';
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const nice = (iso: string) => new Date(`${iso}T12:00:00Z`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric', timeZone: 'UTC' });

// Contract reminder emails due today (30 and 7 days before each notice deadline).
// Called once a day by the Apps Script, which sends them. Each one is returned only once.
export async function GET(request: Request) {
  if (!secretOk(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const supabase = supabaseService();
  const today = todayNY();
  const portal = (process.env.PORTAL_URL ?? new URL(request.url).origin).replace(/\/$/, '');
  const [{ data: rows }, { data: sent }, { data: biz }] = await Promise.all([
    supabase.from('contracts').select('*').eq('status', 'active'),
    supabase.from('contract_reminders_sent').select('contract_id, term_end, kind'),
    supabase.from('businesses').select('id, name'),
  ]);
  const done = new Set((sent ?? []).map((s) => `${s.contract_id}|${s.term_end}|${s.kind}`));
  const emails: { to: string; subject: string; html: string }[] = [];
  const marks: { contract_id: string; term_end: string; kind: string }[] = [];

  for (const c of (rows ?? []) as Contract[]) {
    if (!c.remind_emails?.length) continue;
    const t = currentTerm(c, today);
    const kind = t.daysToNotice >= 0 && t.daysToNotice <= 7 ? '7' : t.daysToNotice > 7 && t.daysToNotice <= 30 ? '30' : null;
    if (!kind || done.has(`${c.id}|${t.end}|${kind}`)) continue;
    const where = c.business_id ? biz?.find((b) => b.id === c.business_id)?.name ?? '' : 'Company-wide';
    const when = t.daysToNotice === 0 ? 'TODAY' : `in ${t.daysToNotice} days`;
    emails.push({
      to: c.remind_emails.join(','),
      subject: `${kind === '7' ? '⚠ ' : ''}Contract notice ${when}: ${c.vendor} (${c.category}${where ? ` · ${where}` : ''})`,
      html: `<div style="font-family:Arial,sans-serif;font-size:14px;color:#222">
<p>The notice deadline for <strong>${esc(c.vendor)}</strong> (${esc(c.category)}${where ? `, ${esc(where)}` : ''}) is <strong>${nice(t.notice)}</strong>, ${when}.</p>
<p>To cancel or renegotiate, give notice by then. The current term ends ${nice(t.end)}${c.auto_renews ? ` and otherwise <strong>renews automatically for ${c.renewal_months} months</strong>` : ''}.</p>
${c.description ? `<p>${esc(c.description)}</p>` : ''}${c.notes ? `<p style="color:#555">Notes: ${esc(c.notes)}</p>` : ''}
<p><a href="${portal}/contracts/${c.id}">Open the contract in the portal</a></p></div>`,
    });
    marks.push({ contract_id: c.id, term_end: t.end, kind });
  }
  if (marks.length) await supabase.from('contract_reminders_sent').upsert(marks, { onConflict: 'contract_id,term_end,kind' });
  return NextResponse.json({ date: today, emails });
}
