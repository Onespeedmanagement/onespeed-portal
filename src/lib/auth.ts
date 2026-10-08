import { redirect } from 'next/navigation';
import { supabaseServer } from './supabase/server';

export type Role = 'admin' | 'bookkeeper' | 'manager' | 'investor';
export type Me = { email: string; role: Role; displayName: string | null };

// The signed-in person, only if they are on the portal's list and active.
export async function getMe(): Promise<Me | null> {
  const supabase = await supabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user?.email) return null;
  const { data } = await supabase
    .from('app_users')
    .select('email, role, display_name, active')
    .eq('email', user.email.toLowerCase())
    .maybeSingle();
  if (!data || !data.active) return null;
  return { email: data.email, role: data.role as Role, displayName: data.display_name };
}

export function homeFor(role: Role): string {
  switch (role) {
    case 'admin': return '/portfolio';
    case 'bookkeeper': return '/bookkeeper';
    case 'manager': return '/closeout';
    case 'investor': return '/investments';
  }
}

// Use at the top of every page: sends people without the right role to their own home.
export async function requireRole(...roles: Role[]): Promise<Me> {
  const me = await getMe();
  if (!me) redirect('/no-access');
  if (!roles.includes(me.role)) redirect(homeFor(me.role));
  return me;
}
