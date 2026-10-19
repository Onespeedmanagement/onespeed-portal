import { requireRole } from '@/lib/auth';
import { ContractsList } from '@/app/contracts/ContractsList';

export const dynamic = 'force-dynamic';

export default async function GoddardContractsPage({ searchParams }: { searchParams: Promise<{ show?: string; add?: string }> }) {
  const me = await requireRole('admin', 'school_admin');
  return <ContractsList me={me} school sp={await searchParams} />;
}
