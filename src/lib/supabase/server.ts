import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

export const VIEW_AS_COOKIE = 'osm_view_as';

// While an admin is using "View as", the portal is read only: refuse any
// change before it leaves (the database refuses it too).
const readOnlyFetch: typeof fetch = (input, init) => {
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const isData = url.includes('/rest/v1/') || url.includes('/storage/v1/');
  const isRead = method === 'GET' || method === 'HEAD' || url.includes('/rest/v1/rpc/');
  if (isData && !isRead) {
    return Promise.resolve(new Response(JSON.stringify({ message: 'You’re viewing as another user. Nothing can be changed in this view. Exit “View as” first.' }),
      { status: 403, headers: { 'content-type': 'application/json' } }));
  }
  return fetch(input, init);
};

// Supabase client acting as the signed-in user. Every query is limited by the
// database's row level security, so pages can only ever read what that user may see.
// { real: true } ignores "View as" (used to check who is actually signed in).
export async function supabaseServer(opts: { real?: boolean } = {}) {
  const cookieStore = await cookies();
  const viewAs = opts.real ? '' : cookieStore.get(VIEW_AS_COOKIE)?.value ?? '';
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      ...(viewAs ? { global: { headers: { 'x-view-as': viewAs }, fetch: readOnlyFetch } } : {}),
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) => {
          try {
            toSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Called from a Server Component: cookies are refreshed by middleware instead.
          }
        },
      },
    },
  );
}
