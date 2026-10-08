import { requireRole } from '@/lib/auth';
import { TopBar } from '@/components/TopBar';

export default async function InvestmentsPage() {
  const me = await requireRole('investor');
  return (
    <>
      <TopBar subtitle="Investor Portal" who={`${me.email} · Investor`} />
      <main className="page">
        <h1>Your investments</h1>
        <div className="notice warn">This screen is being built. You&apos;ll see the businesses One Speed has shared with you here.</div>
      </main>
    </>
  );
}
