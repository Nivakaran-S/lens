import Link from 'next/link';
import { AppHeader } from '../../components/AppHeader';

/**
 * Cookie-presence check happens in frontend/proxy.ts middleware. Role
 * enforcement happens on the backend on every admin API call. The (admin)
 * sub-pages also fetch /api/me and bounce non-admins client-side.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col">
      <AppHeader />
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
