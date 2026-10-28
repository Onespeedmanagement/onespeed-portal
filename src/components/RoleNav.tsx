import type { Role } from '@/lib/auth';
import { AdminNav } from './AdminNav';
import { BookkeeperNav } from './BookkeeperNav';
import { NavBar, type NavLink } from './NavBar';

// Goddard pages get their own bar, so schools stay separate from the liquor stores
function GoddardNav({ active, withPortfolio, withContracts }: { active: string; withPortfolio: boolean; withContracts: boolean }) {
  const main: NavLink[] = [['/goddard', 'Goddard Schools'], ['/goddard/upload', 'Upload financials'], ...(withContracts ? [['/goddard/contracts', 'Contracts'] as NavLink] : [])];
  return <NavBar label="Goddard" active={active} groups={withPortfolio ? [[['/portfolio', '← Portfolio']], main] : [main]} />;
}

export function RoleNav({ role, active }: { role: Role; active: string }) {
  if (active.startsWith('/goddard') && (role === 'admin' || role === 'school_bookkeeper' || role === 'school_admin')) return <GoddardNav active={active} withPortfolio={role === 'admin'} withContracts={role === 'admin' || role === 'school_admin'} />;
  if (role === 'admin') return <AdminNav active={active} />;
  if (role === 'bookkeeper') return <BookkeeperNav active={active} />;
  return null;
}
