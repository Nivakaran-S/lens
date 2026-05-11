'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTransition } from 'react';
import { Coins, Shield } from 'lucide-react';
import { api } from '../lib/api';
import { useUserProfile } from '../lib/useUserProfile';

export function AppHeader() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const { profile } = useUserProfile();

  function signOut() {
    startTransition(async () => {
      await api.signOut().catch(() => {});
      router.replace('/');
      router.refresh();
    });
  }

  const isAdmin = profile?.role === 'admin';
  const credits = profile?.credits ?? null;
  const email = profile?.email ?? null;

  return (
    <header className="border-b border-zinc-200 bg-white/80 backdrop-blur dark:border-zinc-800 dark:bg-black/60">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
        <Link href="/dashboard" className="text-base font-semibold tracking-tight">
          Lens
        </Link>
        <nav className="flex items-center gap-3 text-sm">
          <Link
            href="/dashboard"
            className="text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
          >
            Dashboard
          </Link>
          {isAdmin && (
            <Link
              href="/admin"
              className="flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-medium text-amber-800 hover:bg-amber-100 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200"
            >
              <Shield className="h-3 w-3" aria-hidden /> Admin
            </Link>
          )}
          <Link
            href="/billing"
            className="flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            title="Buy credits"
          >
            <Coins className="h-3 w-3 text-amber-600" aria-hidden />
            <span className="font-mono">{credits ?? '–'}</span>
          </Link>
          <Link
            href="/upload"
            className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
          >
            New analysis
          </Link>
          <span className="hidden text-xs text-zinc-500 sm:inline">{email}</span>
          <Link
            href="/settings"
            className="text-xs text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
          >
            Settings
          </Link>
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
