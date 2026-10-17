import { addDays } from '@/lib/dates';

export const CATEGORIES = ['Insurance', 'Lease', 'Trash', 'Utilities', 'Security / alarm', 'POS / software', 'Pest control', 'Equipment', 'Other'] as const;

export type Contract = {
  id: string; business_id: string | null; category: string; vendor: string; description: string | null;
  start_date: string | null; end_date: string; notice_days: number; auto_renews: boolean; renewal_months: number | null;
  cost: number | null; cost_period: string | null; remind_emails: string[]; status: string; notes: string | null;
};

const addMonths = (iso: string, n: number) => {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
};

// The term that matters today: if an auto-renewing contract's end date has passed,
// roll it forward by its renewal term until it's in the future.
export function currentTerm(c: Pick<Contract, 'end_date' | 'auto_renews' | 'renewal_months' | 'notice_days'>, today: string) {
  let end = c.end_date;
  let rolled = 0;
  if (c.auto_renews && c.renewal_months && c.renewal_months > 0) {
    // count from the original date each time so month-end dates don't drift (Jan 31 → Feb 28 → Mar 31)
    while (end < today && rolled < 600) { rolled++; end = addMonths(c.end_date, rolled * c.renewal_months); }
  }
  const notice = addDays(end, -Math.max(0, c.notice_days));
  const daysToNotice = Math.round((Date.parse(`${notice}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  const daysToEnd = Math.round((Date.parse(`${end}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000);
  return { end, notice, daysToNotice, daysToEnd, rolled };
}

export type Urgency = 'past' | 'soon' | 'upcoming' | 'later' | 'ended';
export function urgency(c: Contract, today: string): Urgency {
  if (c.status !== 'active') return 'ended';
  const t = currentTerm(c, today);
  if (t.daysToEnd < 0) return 'ended';
  if (t.daysToNotice < 0) return 'past';
  if (t.daysToNotice <= 30) return 'soon';
  if (t.daysToNotice <= 90) return 'upcoming';
  return 'later';
}
