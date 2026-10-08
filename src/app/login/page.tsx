'use client';
import { useState } from 'react';
import { supabaseBrowser } from '@/lib/supabase/client';

export default function LoginPage() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setBusy(true);
    setError(null);
    const { error } = await supabaseBrowser().auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: `${window.location.origin}/auth/callback`, queryParams: { prompt: 'select_account' } },
    });
    if (error) { setError(error.message); setBusy(false); }
  }

  return (
    <main style={{ minHeight: '100vh', background: 'var(--green)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '48px 16px' }}>
      <div style={{ width: '100%', maxWidth: 420, display: 'flex', flexDirection: 'column', gap: 28, alignItems: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="serif" style={{ fontSize: 44, fontWeight: 700, color: '#fff' }}>One Speed</div>
          <div className="eyebrow" style={{ color: 'var(--gold)', letterSpacing: 3 }}>Management Portal</div>
        </div>
        <div className="card" style={{ width: '100%', background: 'var(--cream)', display: 'flex', flexDirection: 'column', gap: 18, padding: 32 }}>
          <h1 style={{ fontSize: 30 }}>Sign in</h1>
          <p style={{ margin: 0 }} className="small">Use the Google account an admin added for you. No separate password needed.</p>
          <button className="btn secondary" onClick={signIn} disabled={busy} style={{ display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'center', color: 'var(--text)', borderColor: '#cfc6ae' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.8 3.6-4.9 6.7-4.9z"/></svg>
            {busy ? 'Opening Google…' : 'Sign in with Google'}
          </button>
          {error && <div className="notice bad">{error}</div>}
          <p style={{ margin: 0, textAlign: 'center' }} className="small muted">Only accounts an admin has added can sign in.</p>
        </div>
        <span className="small" style={{ color: '#c7d2c9' }}>Excellence Through Integrity</span>
      </div>
    </main>
  );
}
