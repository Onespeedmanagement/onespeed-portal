import { NextResponse } from 'next/server';
import { getMe } from '@/lib/auth';
import { supabaseServer } from '@/lib/supabase/server';

// Opens a contract file through a short-lived private link (admins only).
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const me = await getMe();
  if (!me || (me.role !== 'admin' && me.role !== 'school_admin')) return NextResponse.redirect(new URL('/no-access', request.url));
  const { id } = await params;
  const supabase = await supabaseServer();
  const { data: file } = await supabase.from('contract_files').select('storage_path, filename').eq('id', id).maybeSingle();
  if (!file) return NextResponse.json({ error: 'not found' }, { status: 404 });
  const { data } = await supabase.storage.from('contracts').createSignedUrl(file.storage_path, 60, { download: false });
  if (!data?.signedUrl) return NextResponse.json({ error: 'not found' }, { status: 404 });
  return NextResponse.redirect(data.signedUrl);
}
