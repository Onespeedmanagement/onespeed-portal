// Local events + holidays for the Schedule Assistant: what's happening each day, and how much
// days like it moved this store's sales before (measured from the POS history).
import { holidaysFor } from '@/lib/holidays';

export type EventKind = 'game' | 'homecoming' | 'family' | 'campus' | 'away' | 'note' | 'holiday' | 'holiday_sales';
export type LocalEvent = { id: string; start_date: string; end_date: string; name: string; kind: Exclude<EventKind, 'holiday' | 'holiday_sales'>; detail: string | null; scope: 'ud' | 'all'; source: string | null };
export type DayEvent = { date: string; name: string; kind: EventKind; detail: string | null; key: string };   // key groups like days for measuring
export type Effect = { factor: number; measured: boolean; samples: number; pct: number };   // pct = factor as a % change

export const KIND_LABEL: Record<EventKind, string> = {
  game: 'Home game', homecoming: 'Homecoming', family: 'Family weekend', campus: 'Campus event', away: 'Students away', note: 'Good to know',
  holiday: 'Holiday', holiday_sales: 'Big sales day',
};
// Starting guesses until the store has history for that kind of day
const DEFAULT: Record<EventKind, number> = { game: 1.15, homecoming: 1.3, family: 1.15, campus: 1.15, away: 0.85, note: 1, holiday: 1, holiday_sales: 1.25 };
// Which kind wins when several land on the same day (biggest effect first)
const RANK: EventKind[] = ['homecoming', 'holiday_sales', 'game', 'family', 'campus', 'away', 'holiday', 'note'];

const addD = (iso: string, n: number) => new Date(Date.parse(`${iso}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);

// Every event and holiday by day, between two dates (inclusive)
export function eventsByDay(events: LocalEvent[], udArea: boolean, from: string, to: string): Map<string, DayEvent[]> {
  const out = new Map<string, DayEvent[]>();
  const add = (e: DayEvent) => { if (e.date < from || e.date > to) return; out.set(e.date, [...(out.get(e.date) ?? []), e]); };
  for (const e of events) {
    if (e.scope === 'ud' && !udArea) continue;
    for (let d = e.start_date < from ? from : e.start_date; d <= e.end_date && d <= to; d = addD(d, 1)) add({ date: d, name: e.name, kind: e.kind, detail: e.detail, key: e.kind });
  }
  for (let y = Number(from.slice(0, 4)); y <= Number(to.slice(0, 4)); y++) {
    for (const h of holidaysFor(y)) add({ date: h.date, name: h.name, kind: h.kind === 'sales' ? 'holiday_sales' : 'holiday', detail: null, key: `h:${h.name}` });
  }
  for (const [d, list] of out) out.set(d, list.sort((a, b) => RANK.indexOf(a.kind) - RANK.indexOf(b.kind)));
  return out;
}

// The event that sets the day's expected effect (ignores "good to know" notes)
export const mainEvent = (list: DayEvent[] | undefined) => list?.find((e) => e.kind !== 'note') ?? null;

// How much each kind of day moved sales here: sales that day ÷ the same weekday in the 4 weeks before
// (skipping other special days). Holidays are matched by name (last year's Halloween, etc.).
export function measureEffects(daily: Map<string, number>, byDay: Map<string, DayEvent[]>, before: string) {
  const special = new Set([...byDay].filter(([, l]) => mainEvent(l)).map(([d]) => d));
  const lifts = new Map<string, number[]>();
  for (const [date, list] of byDay) {
    const ev = mainEvent(list);
    if (!ev || date >= before) continue;
    const s = daily.get(date);
    if (!s) continue;
    const base = [7, 14, 21, 28].map((n) => addD(date, -n)).filter((d) => !special.has(d)).map((d) => daily.get(d)).filter((v): v is number => !!v);
    if (base.length < 2) continue;
    const lift = s / (base.reduce((a, v) => a + v, 0) / base.length);
    lifts.set(ev.key, [...(lifts.get(ev.key) ?? []), lift]);
  }
  return (ev: DayEvent): Effect => {
    const l = lifts.get(ev.key) ?? [];
    const factor = l.length ? Math.min(2.5, Math.max(0.5, l.reduce((a, v) => a + v, 0) / l.length)) : DEFAULT[ev.kind];
    return { factor, measured: l.length > 0, samples: l.length, pct: Math.round((factor - 1) * 100) };
  };
}
