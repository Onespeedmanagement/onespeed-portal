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
          <div className="eyebrow">Add or correct a day</div>
          <h1>Upload POS reports</h1>
          <span className="small muted">For any store and day. The store and date are read from inside each PDF. Uploading a report for a day that already has one replaces its numbers, and Ujash and Vrajesh are alerted with the before and after. Cash is still entered by the store manager.</span>
        </div>
        <UploadForm upload={bookkeeperUpload} overrideOption note="Pick one or many (up to 40). Each file is checked before anything is saved." />
      </main>
    </>
  );
}
