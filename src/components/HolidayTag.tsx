import { holidayOn } from '@/lib/holidays';

export function HolidayTag({ date }: { date: string }) {
  const h = holidayOn(date);
  if (!h) return null;
  return (
    <span className="pill" style={{ marginLeft: 6, padding: '2px 8px', fontSize: 11,
      background: h.kind === 'federal' ? '#e3e8f2' : 'var(--warn-bg)', color: h.kind === 'federal' ? '#2b3e66' : 'var(--warn)' }}>
      {h.name}
    </span>
  );
}
