// Staffing vs traffic: for each hour of each scheduled day, how many people are on and
// how many customers come in (actual for past days, the usual for that weekday otherwise).

export type ShiftRow = { shift_date: string; employee: string; position: string | null; start_min: number; end_min: number; rate: number | null };
export type DayHours = { business_date: string; total_sales: number | null; transactions: number | null; hourly: { hour: number; count: number; amount: number }[] | null };
export type Targets = { high: number; low: number; nightMin: number };   // customers per person per hour; people kept on after 9pm

export type Cell = { hour: number; staff: number; customers: number | null; sales: number | null; laborCost: number; perPerson: number | null; status: 'under' | 'over' | 'ok' | 'closed' | 'unknown' };
export type Day = { date: string; weekday: string; source: 'actual' | 'usual' | 'none'; basedOn: number; cells: Cell[]; laborHours: number; laborCost: number; sales: number | null; laborPct: number | null; people: string[] };
export type Suggestion = { date: string; kind: 'under' | 'over'; from: number; to: number; text: string; saving?: number };

const WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const weekdayOf = (iso: string) => new Date(`${iso}T12:00:00Z`).getUTCDay();
export const hourLabel = (h: number) => { const x = h % 24; return `${x % 12 === 0 ? 12 : x % 12}${x < 12 ? 'am' : 'pm'}`; };
const usd = (n: number) => n.toLocaleString('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });

// Usual customers and sales for each hour of a weekday, from past days
function usual(history: DayHours[], weekday: number) {
  const same = history.filter((d) => d.hourly?.length && weekdayOf(d.business_date) === weekday);
  const pool = same.length ? same : history.filter((d) => d.hourly?.length);
  const by = new Map<number, { c: number; s: number }>();
  for (const d of pool) for (const h of d.hourly!) { const v = by.get(h.hour) ?? { c: 0, s: 0 }; v.c += h.count; v.s += h.amount; by.set(h.hour, v); }
  const n = pool.length;
  return { n, sameDay: same.length > 0, hours: new Map([...by].map(([h, v]) => [h, { count: v.c / n, amount: v.s / n }])) };
}

export function analyzeWeek(dates: string[], shifts: ShiftRow[], history: DayHours[], t: Targets) {
  const openHours = new Set<number>();
  for (const d of history) for (const h of d.hourly ?? []) if (h.count > 0) openHours.add(h.hour);
  for (const s of shifts) for (let m = s.start_min; m < s.end_min; m += 60) openHours.add(Math.floor(m / 60) % 24);
  // business day runs from morning to the early hours: 1am–4am sort after 11pm
  const hours = [...openHours].sort((a, b) => (a < 5 ? a + 24 : a) - (b < 5 ? b + 24 : b));

  const days: Day[] = dates.map((date) => {
    const mine = shifts.filter((s) => s.shift_date === date);
    const actual = history.find((d) => d.business_date === date && d.hourly?.length);
    const u = actual ? null : usual(history.filter((d) => d.business_date < date), weekdayOf(date));
    const traffic = actual ? new Map(actual.hourly!.map((h) => [h.hour, { count: h.count, amount: h.amount }])) : u!.hours;
    const cells: Cell[] = hours.map((hour) => {
      // people on the floor this hour (a shift covering half the hour counts as half)
      let staff = 0, laborCost = 0;
      for (const s of mine) {
        const a = Math.max(s.start_min, hour * 60), b = Math.min(s.end_min, hour * 60 + 60);
        // shifts past midnight belong to the same business day
        const a2 = Math.max(s.start_min, hour * 60 + 1440), b2 = Math.min(s.end_min, hour * 60 + 1500);
        const f = (Math.max(0, b - a) + Math.max(0, b2 - a2)) / 60;
        staff += f; laborCost += f * (s.rate ?? 0);
      }
      const tr = traffic.get(hour);
      const customers = tr ? tr.count : (actual || (u && u.n) ? 0 : null);
      const sales = tr ? tr.amount : (actual || (u && u.n) ? 0 : null);
      const perPerson = customers != null && staff > 0 ? customers / staff : null;
      const status: Cell['status'] = customers == null ? 'unknown'
        : staff === 0 ? (customers >= 3 ? 'under' : 'closed')
        : perPerson! > t.high ? 'under'
        : staff - 1 >= minFor(hour, t) && perPerson! < t.low ? 'over' : 'ok';
      return { hour, staff: Math.round(staff * 10) / 10, customers: customers == null ? null : Math.round(customers), sales, laborCost, perPerson, status };
    });
    const laborHours = mine.reduce((a, s) => a + (s.end_min - s.start_min) / 60, 0);
    const laborCost = mine.reduce((a, s) => a + ((s.end_min - s.start_min) / 60) * (s.rate ?? 0), 0);
    const sales = actual ? actual.total_sales : u && u.n ? [...u.hours.values()].reduce((a, v) => a + v.amount, 0) : null;
    return { date, weekday: WD[weekdayOf(date)], source: actual ? 'actual' : u && u.n ? 'usual' : 'none', basedOn: actual ? 1 : u?.n ?? 0, cells, laborHours, laborCost,
      sales, laborPct: sales ? (laborCost / sales) * 100 : null, people: [...new Set(mine.map((s) => s.employee))] };
  });

  // Turn runs of red / amber hours into plain suggestions
  const suggestions: Suggestion[] = [];
  for (const d of days) {
    for (let i = 0; i < d.cells.length; i++) {
      const c = d.cells[i];
      if (c.status !== 'under' && c.status !== 'over') continue;
      let j = i; while (j + 1 < d.cells.length && d.cells[j + 1].status === c.status && d.cells[j + 1].hour === d.cells[j].hour + 1) j++;
      const run = d.cells.slice(i, j + 1);
      const avgC = run.reduce((a, x) => a + (x.customers ?? 0), 0) / run.length;
      const avgS = run.reduce((a, x) => a + x.staff, 0) / run.length;
      const span = `${hourLabel(run[0].hour)}–${hourLabel(run[run.length - 1].hour + 1)}`;
      const word = d.source === 'actual' ? '' : 'usually ';
      if (c.status === 'under') {
        const need = Math.max(1, Math.ceil(avgC / t.high - avgS));
        suggestions.push({ date: d.date, kind: 'under', from: run[0].hour, to: run[run.length - 1].hour + 1,
          text: `${d.weekday} ${span}: ${avgS ? `${fmtStaff(avgS)} on` : 'nobody scheduled'} for ${word}~${Math.round(avgC)} customers an hour. Add ${need} person${need > 1 ? 's' : ''}, or start someone earlier.` });
      } else {
        const spare = Math.max(1, Math.floor(Math.min(avgS - Math.max(1, avgC / t.low), avgS - Math.max(...run.map((x) => minFor(x.hour, t))))));
        const rate = run.reduce((a, x) => a + (x.staff ? x.laborCost / x.staff : 0), 0) / run.length || 15;
        const saving = spare * run.length * rate;
        suggestions.push({ date: d.date, kind: 'over', from: run[0].hour, to: run[run.length - 1].hour + 1, saving,
          text: `${d.weekday} ${span}: ${fmtStaff(avgS)} on for ${word}~${Math.round(avgC)} customers an hour. ${spare} fewer person${spare > 1 ? 's' : ''} here saves about ${usd(saving)}.` });
      }
      i = j;
    }
  }
  // Shortages first, then the biggest savings; skip tiny ones
  const list = suggestions.filter((s) => s.kind === 'under' || (s.saving ?? 0) >= 25)
    .sort((a, b) => (a.kind === b.kind ? (b.saving ?? 0) - (a.saving ?? 0) : a.kind === 'under' ? -1 : 1));
  return { hours, days, suggestions: list };
}

// Late evening / overnight: keep at least nightMin people on (safety at close)
const minFor = (hour: number, t: Targets) => (hour >= 21 || hour < 5 ? t.nightMin : 1);
const fmtStaff = (n: number) => (Number.isInteger(n) ? `${n}` : n.toFixed(1)) + (Math.round(n) === 1 ? ' person' : ' people');
