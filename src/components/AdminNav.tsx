import { NavBar, type NavLink } from './NavBar';

// Grouped: overview · money · store work · setup
const GROUPS: NavLink[][] = [
  [['/portfolio', 'Portfolio'], ['/dashboard', 'Dashboard'], ['/owners', 'Owners Report'], ['/forecasting', 'Forecasting']],
  [['/cash', 'Cash & deposits'], ['/discrepancies', 'Discrepancies'], ['/audit', 'Audit']],
  [['/push', 'Store tools'], ['/admin/upload', 'Upload POS reports']],
  [['/admin/users', 'Users & employees'], ['/admin/stores', 'Stores'], ['/contracts', 'Contracts']],
];

export function AdminNav({ active }: { active: string }) {
  return <NavBar label="Admin" groups={GROUPS} active={active} />;
}
