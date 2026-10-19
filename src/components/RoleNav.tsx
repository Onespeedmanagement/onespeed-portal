import type { Role } from '@/lib/auth';
import { AdminNav } from './AdminNav';
import { BookkeeperNav } from './BookkeeperNav';

const SCHOOL_LINKS = [['/goddard', 'Goddard Schools'], ['/goddard/upload', 'Upload financials']] as const;

export function RoleNav({ role, active }: { role: Role; active: string }) {
  if (role === 'admin') return <AdminNav active={active} />;
  if (role === 'bookkeeper') return <BookkeeperNav active={active} />;
  if (role === 'school_bookkeeper') return (
    <nav aria-label="Goddard" style={{ background: '#2c5240', padding: '0 clamp(16px, 3vw, 40px)', display: 'flex', gap: 22 }}>
      {SCHOOL_LINKS.map(([href, label]) => (
        <a key={href} href={href} style={{ color: href === active ? '#fff' : '#e9e3d2', textDecoration: 'none', fontSize: 14, padding: '12px 2px',
          borderBottom: `3px solid ${href === active ? 'var(--gold)' : 'transparent'}` }}>{label}</a>
      ))}
    </nav>
  );
  return null;
}
