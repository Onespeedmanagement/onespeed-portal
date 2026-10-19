import type { Role } from '@/lib/auth';
import { AdminNav } from './AdminNav';
import { BookkeeperNav } from './BookkeeperNav';

export function RoleNav({ role, active }: { role: Role; active: string }) {
  if (role === 'admin') return <AdminNav active={active} />;
  if (role === 'bookkeeper') return <BookkeeperNav active={active} />;
  return null;
}
