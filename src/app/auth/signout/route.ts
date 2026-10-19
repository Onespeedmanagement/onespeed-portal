import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { supabaseServer, VIEW_AS_COOKIE } from '@/lib/supabase/server';

export async function POST(request: Request) {
  (await cookies()).delete(VIEW_AS_COOKIE);
  const supabase = await supabaseServer({ real: true });
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url), { status: 303 });
}
