import { redirect } from 'next/navigation';
import { getMe, homeFor } from '@/lib/auth';

// Sends each person straight to their own screen.
export default async function Home() {
  const me = await getMe();
  if (!me) redirect('/no-access');
  redirect(homeFor(me.role));
}
