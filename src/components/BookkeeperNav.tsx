import { NavBar } from './NavBar';

export function BookkeeperNav({ active }: { active: string }) {
  return <NavBar label="Bookkeeping" active={active} groups={[[['/bookkeeper', 'Daily entries'], ['/bookkeeper/owners', 'Owners Report'], ['/bookkeeper/upload', 'Upload POS reports']]]} />;
}
