import { redirect } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { ContractsList } from './ContractsList';

export const dynamic = 'force-dynamic';

export default async function ContractsPage({ searchParams }: { searchParams: Promise<{ show?: string; add?: string; vendor?: string; category?: string; store?: string }> }) {
  const me = await requireRole('admin', 'school_admin');
  if (me.role === 'school_admin') redirect('/goddard/contracts');
  return <ContractsList me={me} school={false} sp={await searchParams} />;
}

