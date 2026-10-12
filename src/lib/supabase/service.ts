import { createClient } from '@supabase/supabase-js';

// Server-only client for automated jobs (nightly email pickup, morning summary).
// Bypasses row level security, so it is only used behind the shared secret.
export function supabaseService() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set');
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, key, { auth: { persistSession: false } });
}

export function secretOk(request: Request): boolean {
  const expected = process.env.POS_INBOUND_SECRET;
  const given = request.headers.get('x-portal-secret');
  if (!expected || !given || expected.length !== given.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ given.charCodeAt(i);
  return diff === 0;
}
