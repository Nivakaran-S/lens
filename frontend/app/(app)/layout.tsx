import { redirect } from 'next/navigation';
import { getSupabaseServer } from '../../lib/supabase/server';
import { AppHeader } from '../../components/AppHeader';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect('/sign-in');

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader email={user.email ?? null} />
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
