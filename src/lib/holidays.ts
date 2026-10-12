// Built-in US holiday calendar (fixed rules, no outside service).
// kind 'federal' = federal holiday; 'sales' = big liquor sales day.
export type Holiday = { date: string; name: string; kind: 'federal' | 'sales' };

const iso = (y: number, m: number, d: number) => new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10);
// nth weekday (0=Sun) of a month; n = -1 for last
function nthWeekday(y: number, m: number, weekday: number, n: number): number {
  if (n > 0) {
    const first = new Date(Date.UTC(y, m - 1, 1)).getUTCDay();
    return 1 + ((weekday - first + 7) % 7) + (n - 1) * 7;
  }
  const lastDay = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const last = new Date(Date.UTC(y, m - 1, lastDay)).getUTCDay();
  return lastDay - ((last - weekday + 7) % 7);
}

export function holidaysFor(y: number): Holiday[] {
  const thanksgiving = nthWeekday(y, 11, 4, 4);
  return [
    { date: iso(y, 1, 1), name: "New Year's Day", kind: 'federal' },
    { date: iso(y, 1, nthWeekday(y, 1, 1, 3)), name: 'Martin Luther King Jr. Day', kind: 'federal' },
    { date: iso(y, 2, nthWeekday(y, 2, 0, 2)), name: 'Super Bowl Sunday', kind: 'sales' },
    { date: iso(y, 2, nthWeekday(y, 2, 1, 3)), name: "Presidents' Day", kind: 'federal' },
    { date: iso(y, 3, 17), name: "St. Patrick's Day", kind: 'sales' },
    { date: iso(y, 5, 5), name: 'Cinco de Mayo', kind: 'sales' },
    { date: iso(y, 5, nthWeekday(y, 5, 1, -1)), name: 'Memorial Day', kind: 'federal' },
    { date: iso(y, 6, 19), name: 'Juneteenth', kind: 'federal' },
    { date: iso(y, 7, 4), name: 'Independence Day', kind: 'federal' },
    { date: iso(y, 9, nthWeekday(y, 9, 1, 1)), name: 'Labor Day', kind: 'federal' },
    { date: iso(y, 10, nthWeekday(y, 10, 1, 2)), name: 'Columbus Day', kind: 'federal' },
    { date: iso(y, 10, 31), name: 'Halloween', kind: 'sales' },
    { date: iso(y, 11, 11), name: 'Veterans Day', kind: 'federal' },
    { date: iso(y, 11, thanksgiving - 1), name: 'Thanksgiving Eve', kind: 'sales' },
    { date: iso(y, 11, thanksgiving), name: 'Thanksgiving', kind: 'federal' },
    { date: iso(y, 12, 24), name: 'Christmas Eve', kind: 'sales' },
    { date: iso(y, 12, 25), name: 'Christmas Day', kind: 'federal' },
    { date: iso(y, 12, 31), name: "New Year's Eve", kind: 'sales' },
  ];
}

export function holidayOn(date: string): Holiday | undefined {
  return holidaysFor(Number(date.slice(0, 4))).find((h) => h.date === date);
}
