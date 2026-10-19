import { cookies } from 'next/headers';
import { getMe } from '@/lib/auth';
import { VIEW_AS_COOKIE } from '@/lib/supabase/server';
import { stopViewAs } from '@/app/view-as/actions';

// Shown on every page while an admin is using "View as"
export async function ViewAsBanner() {
  if (!(await cookies()).get(VIEW_AS_COOKIE)) return null;
  const me = await getMe();
  if (!me?.viewingAs) return null;
  return (
    <div style={{ position: 'sticky', top: 0, zIndex: 50, background: '#8a2e10', color: '#fff', padding: '8px clamp(16px, 3vw, 40px)', display: 'flex', gap: 12, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', fontSize: 14 }}>
      <span>👁 Viewing as <strong>{me.displayName || me.email}</strong> ({me.role}) · read only, nothing can be changed</span>
      <form action={stopViewAs}><button type="submit" className="btn secondary" style={{ minHeight: 32, padding: '4px 12px' }}>Exit view</button></form>
    </div>
  );
}
