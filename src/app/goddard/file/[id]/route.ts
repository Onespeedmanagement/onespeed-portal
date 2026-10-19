import { NextResponse } from 'next/server';
import { getMe } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

// Opens a school report through a short-lived private link. The database decides
// who may see it (admins, bookkeeper, investors with Owners Report access to that school).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me) return NextResponse.redirect(new URL('/no-access', request.url));
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: file } = await supabase.from('school_files').select('storage_path').eq('id', id).maybeSingle();
  if (!file) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { data } = await supabase.storage.from('school-reports').createSignedUrl(file.storage_path, 60);
  if (!data?.signedUrl) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
