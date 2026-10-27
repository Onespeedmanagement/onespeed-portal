import * as XLSX from 'xlsx';

// When I Work schedule export (.xlsx). Uses the "Schedules Summary" sheet: one row per shift with
// First/Last Name, Position, Shift Start Date, Shift Start Time, Shift End Time, Scheduled Hours, Hourly Rate, Labor Cost.
export type Shift = { shift_date: string; employee: string; position: string | null; start_min: number; end_min: number; hours: number | null; rate: number | null; cost: number | null };
export type ParsedSchedule = { schedule: string | null; shifts: Shift[]; openShifts: number; from: string; to: string };

const num = (v: unknown) => { if (typeof v === 'number') return v; const n = Number(String(v ?? '').replace(/[$,\s]/g, '')); return String(v ?? '').trim() && Number.isFinite(n) ? n : null; };
const isoDate = (v: unknown): string | null => {
  if (typeof v === 'number') { const d = XLSX.SSF.parse_date_code(v); return d ? `${d.y}-${String(d.m).padStart(2, '0')}-${String(d.d).padStart(2, '0')}` : null; }
  const s = String(v ?? '').trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (us) return `${us[3].length === 2 ? `20${us[3]}` : us[3]}-${us[1].padStart(2, '0')}-${us[2].padStart(2, '0')}`;
  const t = Date.parse(s); return Number.isFinite(t) ? new Date(t).toISOString().slice(0, 10) : null;
};
// "9:00 am" / "12:00 am" / "4p" / 0.375 (Excel time) → minutes after midnight
export function minutes(v: unknown): number | null {
  if (typeof v === 'number') return Math.round((v % 1) * 1440);
  const m = String(v ?? '').trim().toLowerCase().match(/^(\d{1,2})(?::(\d{2}))?\s*([ap])\.?m?\.?$/);
  if (!m) return null;
  const h = Number(m[1]) % 12 + (m[3] === 'p' ? 12 : 0);
  return h * 60 + Number(m[2] ?? 0);
}

export function parseWhenIWork(bytes: Uint8Array): ParsedSchedule {
  const wb = XLSX.read(bytes, { type: 'array' });
  const name = wb.SheetNames.find((n) => /schedules?\s*summary|shifts/i.test(n)) ?? wb.SheetNames.find((n) => {
    const g = XLSX.utils.sheet_to_json(wb.Sheets[n], { header: 1, defval: '' }) as unknown[][];
    return (g[0] ?? []).some((c) => /shift start/i.test(String(c)));
  });
  if (!name) throw new Error('Couldn’t find the shift list. In When I Work, export the schedule to Excel; the file should have a “Schedules Summary” sheet.');
  const g = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: '' }) as unknown[][];
  const h = g.findIndex((r) => r.some((c) => /shift start date/i.test(String(c))));
  if (h < 0) throw new Error('The sheet has no “Shift Start Date” column.');
  const head = g[h].map((c) => String(c ?? '').trim().toLowerCase());
  const col = (re: RegExp) => head.findIndex((c) => re.test(c));
  const ix = { sched: col(/^schedule$/), pos: col(/^position$/), first: col(/^first name$/), last: col(/^last name$/), open: col(/openshift/),
    date: col(/shift start date/), start: col(/shift start time/), end: col(/shift end time/), brk: col(/unpaid break/), hours: col(/scheduled hours/),
    rate: col(/hourly rate/), cost: col(/labor cost/) };

  const shifts: Shift[] = [];
  let openShifts = 0, schedule: string | null = null;
  for (const r of g.slice(h + 1)) {
    const date = isoDate(r[ix.date]);
    const start = minutes(r[ix.start]); let end = minutes(r[ix.end]);
    if (!date || start == null || end == null) continue;
    const employee = `${String(r[ix.first] ?? '').trim()} ${String(r[ix.last] ?? '').trim()}`.trim();
    if (!employee) { openShifts += Math.max(1, num(r[ix.open]) ?? 1); continue; }   // open shift nobody has taken
    if (end <= start) end += 1440;   // runs past midnight
    schedule = schedule ?? (String(r[ix.sched] ?? '').trim() || null);
    shifts.push({ shift_date: date, employee, position: String(r[ix.pos] ?? '').trim() || null, start_min: start, end_min: end,
      hours: num(r[ix.hours]), rate: num(r[ix.rate]), cost: num(r[ix.cost]) });
  }
  if (!shifts.length) throw new Error('No shifts found in the file.');
  const dates = shifts.map((s) => s.shift_date).sort();
  return { schedule, shifts, openShifts, from: dates[0], to: dates[dates.length - 1] };
}
