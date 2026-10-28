import { NavBar, type NavLink } from './NavBar';

// Store tools bar: managers see it at the top of their pages; admins see it on the store tool pages
export function ManagerNav({ active, admin = false }: { active: string; admin?: boolean }) {
  const tools: NavLink[] = [['/push', 'Items to push'], ['/schedule', 'Schedule Assistant']];
  const groups: NavLink[][] = admin ? [[['/portfolio', '← Portfolio']], tools] : [[['/closeout', 'Close-out'], ...tools]];
  return <NavBar label="Store tools" className="no-print" active={active} groups={groups} />;
}
