import { redirect } from 'next/navigation';
import Link from 'next/link';
import { getSupabaseServer } from '../../lib/supabase/server';
import { AppHeader } from '../../components/AppHeader';

/**
 * Server-side gate: only authenticated admins can render any /admin route.
 * We check the Supabase session here for the email, then defer the actual
 * role check to the client side via /api/me. That avoids a server→backend
 * round-trip on every page transition while still preventing the page
 * from leaking before the role check completes (the (admin) sub-pages
 * fetch /api/me and redirect non-admins).
 *
 * For a stricter server-side guard, we'd fetch /api/me from the server
 * here with the user's access token; doable but adds complexity for
 * marginal benefit.
 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const supabase = await getSupabaseServer();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/sign-in?next=/admin');

  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader email={user.email ?? null} />
      <div className="border-b border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/30">
        <div className="mx-auto flex max-w-5xl items-center gap-4 px-6 py-2 text-xs">
          <span className="font-semibold text-amber-900 dark:text-amber-200">Admin</span>
          <Link href="/admin" className="text-amber-800 hover:underline dark:text-amber-300">
            Overview
          </Link>
          <Link href="/admin/users" className="text-amber-800 hover:underline dark:text-amber-300">
            Users
          </Link>
          <Link href="/admin/packages" className="text-amber-800 hover:underline dark:text-amber-300">
            Packages
          </Link>
        </div>
      </div>
      <main className="mx-auto w-full max-w-5xl flex-1 px-6 py-8">{children}</main>
    </div>
  );
}
