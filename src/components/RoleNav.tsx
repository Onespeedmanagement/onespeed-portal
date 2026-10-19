import type { Role } from '@/lib/auth';
import { AdminNav } from './AdminNav';
import { BookkeeperNav } from './BookkeeperNav';

// Goddard pages get their own bar, so schools stay separate from the liquor stores
function GoddardNav({ active, withPortfolio }: { active: string; withPortfolio: boolean }) {
  const links = [...(withPortfolio ? [['/portfolio', '← Portfolio']] : []), ['/goddard', 'Goddard Schools'], ['/goddard/upload', 'Upload financials']];
  return (
    <nav aria-label="Goddard" style={{ background: '#2c5240', padding: '0 clamp(16px, 3vw, 40px)', display: 'flex', gap: 22, flexWrap: 'wrap' }}>
      {links.map(([href, label]) => (
        <a key={href} href={href} style={{ color: href === active ? '#fff' : '#e9e3d2', textDecoration: 'none', fontSize: 14, padding: '12px 2px',
          borderBottom: `3px solid ${href === active ? 'var(--gold)' : 'transparent'}` }}>{label}</a>
      ))}
    </nav>
  );
}

export function RoleNav({ role, active }: { role: Role; active: string }) {
  if (active.startsWith('/goddard') && (role === 'admin' || role === 'school_bookkeeper')) return <GoddardNav active={active} withPortfolio={role === 'admin'} />;
  if (role === 'admin') return <AdminNav active={active} />;
  if (role === 'bookkeeper') return <BookkeeperNav active={active} />;
  return null;
}
