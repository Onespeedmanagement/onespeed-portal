import type { SupabaseClient } from '@supabase/supabase-js';

// Contracts are split by portfolio: Goddard schools on one side, stores (and hotels) on the other.
export async function contractScope(supabase: SupabaseClient, school: boolean) {
  const { data: pfs } = await supabase.from('portfolios').select('id, name, kind, sort').order('sort');
  const scoped = (pfs ?? []).filter((p) => (school ? p.kind === 'school' : p.kind !== 'school'));
  const ids = scoped.map((p) => p.id);
  const { data: businesses } = ids.length
    ? await supabase.from('businesses').select('id, name, portfolio_id').eq('active', true).in('portfolio_id', ids).order('name')
    : { data: [] as { id: string; name: string; portfolio_id: string }[] };
  const { data: people } = await supabase.rpc('reminder_people', { school });
  return {
    portfolioIds: ids,
    defaultPortfolio: scoped.find((p) => (school ? p.kind === 'school' : p.kind === 'retail'))?.id ?? ids[0] ?? null,
    businesses: (businesses ?? []) as { id: string; name: string; portfolio_id: string }[],
    people: ((people ?? []) as { email: string; display_name: string | null }[]).map((a) => ({ email: a.email, name: a.display_name || a.email.split('@')[0] })),
    base: school ? '/goddard/contracts' : '/contracts',
    allLabel: school ? 'All Goddard schools' : 'Company-wide / all stores',
  };
}
