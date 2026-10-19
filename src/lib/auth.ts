import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { supabaseServer, VIEW_AS_COOKIE } from './supabase/server';

export type Role = 'admin' | 'bookkeeper' | 'manager' | 'investor' | 'school_bookkeeper';
// viewingAs = the admin's own email while they use "View as"
export type Me = { email: string; role: Role; displayName: string | null; viewingAs?: string };

// The signed-in person, only if they are on the portal's list and active.
// An admin using "View as" gets the other person instead (read only).
export async function getMe(): Promise<Me | null> {
  const supabase = await supabaseServer({ real: true });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data } = await supabase
    .from('app_users')
    .select('email, role, display_name, active')
    .eq('email', user.email.toLowerCase())
    .maybeSingle();
  if (!data || !data.active) return null;
  const real: Me = { email: data.email, role: data.role as Role, displayName: data.display_name };

  const viewAs = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (viewAs && real.role === 'admin' && viewAs !== real.email) {
    const { data: other } = await supabase.from('app_users').select('email, role, display_name, active').eq('email', viewAs).maybeSingle();
    if (other) return { email: other.email, role: other.role as Role, displayName: other.display_name, viewingAs: real.email };
  }
  return real;
}

export const ROLE_LABEL: Record<Role, string> = { admin: 'Admin', bookkeeper: 'Bookkeeper', manager: 'Manager', investor: 'Investor', school_bookkeeper: 'Goddard bookkeeper' };

export function homeFor(role: Role): string {
  switch (role) {
    case 'admin': return '/portfolio';
    case 'bookkeeper': return '/bookkeeper';
    case 'manager': return '/closeout';
    case 'investor': return '/investments';
    case 'school_bookkeeper': return '/goddard';
  }
}

// Use at the top of every page: sends people without the right role to their own home.
export async function requireRole(...roles: Role[]): Promise<Me> {
  const me = await getMe();
  if (!me) redirect('/no-access');
  if (!roles.includes(me.role)) redirect(homeFor(me.role));
  return me;
}
