'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { getSupabaseBrowser } from '../lib/supabase/client';

export function AppHeader({ email }: { email: string | null }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function signOut() {
    startTransition(async () => {
      const supabase = getSupabaseBrowser();
      await supabase.auth.signOut();
      router.replace('/');
      router.refresh();
    });
  }

  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/60">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/dashboard" className="text-base font-semibold tracking-tight">
          Lens
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/dashboard" className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100">
            Dashboard
          </Link>
          <Link
            href="/upload"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            New analysis
          </Link>
          <span className="hidden text-xs text-zinc-500 sm:inline">{email}</span>
          <button
            onClick={signOut}
            disabled={pending}
            className="text-xs text-zinc-500 hover:text-zinc-900 disabled:opacity-50 dark:hover:text-zinc-100"
          >
            {pending ? 'Signing out…' : 'Sign out'}
          </button>
        </nav>
      </div>
    </header>
  );
}
