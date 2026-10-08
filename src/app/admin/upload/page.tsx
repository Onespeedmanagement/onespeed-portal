import { requireRole } from '@/lib/auth';
import { TopBar } from '@/components/TopBar';
import { UploadForm } from './UploadForm';

export default async function UploadPage() {
  const me = await requireRole('admin');
  return (
    <>
      <TopBar subtitle="Incoming reports" who={`${me.email} · Admin`} />
      <main className="page">
        <div>
          <a href="/portfolio" className="small">← Portfolio</a>
          <div className="eyebrow" style={{ marginTop: 8 }}>Manual upload · backup to the nightly email</div>
          <h1>Upload POS reports</h1>
        </div>
        <UploadForm />
      </main>
    </>
  );
}
