import { requireRole } from '@/lib/auth';
import { TopBar } from '@/components/TopBar';
import { BookkeeperNav } from '@/components/BookkeeperNav';
import { UploadForm } from '@/app/admin/upload/UploadForm';
import { bookkeeperUpload } from './actions';

export default async function BookkeeperUploadPage() {
  const me = await requireRole('bookkeeper');
  return (
    <>
      <TopBar subtitle="Bookkeeping" who={`${me.email} · Bookkeeper`} />
      <BookkeeperNav active="/bookkeeper/upload" />
      <main className="page">
        <div>
          <div className="eyebrow">Fill in missing days</div>
          <h1>Upload POS reports</h1>
          <span className="small muted">For days that don&apos;t have their POS report yet, any store. The store and date are read from inside each PDF. A day that already has a report is skipped; ask an admin if one needs replacing. Cash is still entered by the store manager.</span>
        </div>
        <UploadForm upload={bookkeeperUpload} note="Pick one or many (up to 40). Each file is checked before anything is saved." />
      </main>
    </>
  );
}
