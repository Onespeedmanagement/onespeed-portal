import { NextResponse } from 'next/server';
import { ingestPosPdf } from '@/lib/pos/ingest';
import { secretOk, supabaseService } from '@/lib/supabase/service';

export const runtime = 'nodejs';
export const maxDuration = 60;

// Called by the Google Apps Script in the posreports@ mailbox with each new POS PDF.
export async function POST(request: Request) {
  if (!secretOk(request)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const body = await request.json().catch(() => null) as { filename?: string; data?: string } | null;
  if (!body?.filename || !body.data) return NextResponse.json({ error: 'filename and data (base64) are required' }, { status: 400 });
  const bytes = new Uint8Array(Buffer.from(body.data, 'base64'));
  if (bytes.length > 10_000_000) return NextResponse.json({ error: 'file too large' }, { status: 413 });
  const result = await ingestPosPdf(supabaseService(), bytes, body.filename, 'email');
  return NextResponse.json(result);
}
