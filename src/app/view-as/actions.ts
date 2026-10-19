'use server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getMe, homeFor, type Role } from '@/lib/auth';
import { supabaseServer, VIEW_AS_COOKIE } from '@/lib/supabase/server';

export async function startViewAs(form: FormData) {
  const jar = await cookies();
  jar.delete(VIEW_AS_COOKIE);
  const me = await getMe();
  if (!me || me.role !== 'admin') redirect('/');
  const email = String(form.get('email') ?? '').toLowerCase();
  const supabase = await supabaseServer({ real: true });
  const { data: u } = await supabase.from('app_users').select('email, role').eq('email', email).maybeSingle();
  if (!u || u.email === me.email) redirect('/admin/users');
  jar.set(VIEW_AS_COOKIE, u.email, { httpOnly: true, sameSite: 'lax', secure: true, path: '/', maxAge: 60 * 60 * 2 });
  redirect(homeFor(u.role as Role));
}

export async function stopViewAs() {
  const jar = await cookies();
  const email = jar.get(VIEW_AS_COOKIE)?.value;
  jar.delete(VIEW_AS_COOKIE);
  redirect(email ? `/admin/users/view?email=${encodeURIComponent(email)}` : '/admin/users');
}
