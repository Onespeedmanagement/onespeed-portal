import { requireRole } from '@/lib/auth';
import { TopBar } from '@/components/TopBar';

export default async function BookkeeperPage() {
  const me = await requireRole('bookkeeper');
  return (
    <>
      <TopBar subtitle="Bookkeeping" who={`${me.email} · Bookkeeper`} />
      <main className="page">
        <h1>Daily entries</h1>
        <div className="notice warn">This screen is being built. You&apos;ll see each store&apos;s sales, cash and deposits here, and enter the Owners Report.</div>
      </main>
    </>
  );
}
