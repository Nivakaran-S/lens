'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api } from '../../lib/api';
import { useUserProfile } from '../../lib/useUserProfile';
import type { AdminUser, CreditPackage } from '../../lib/types';

export default function AdminOverviewPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useUserProfile();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [packages, setPackages] = useState<CreditPackage[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile) return;
    if (profile.role !== 'admin') {
      router.replace('/dashboard');
      return;
    }
    let cancelled = false;
    Promise.all([api.adminListUsers(), api.adminListPackages()])
      .then(([u, p]) => {
        if (cancelled) return;
        setUsers(u.users);
        setPackages(p.packages);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, [profile, profileLoading, router]);

  if (profileLoading || !profile) {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }
  if (profile.role !== 'admin') {
    return null; // redirect already triggered
  }

  const totalUsers = users?.length ?? 0;
  const totalCredits = users?.reduce((sum, u) => sum + u.credits, 0) ?? 0;
  const activePackages = packages?.filter((p) => p.active).length ?? 0;
  const adminCount = users?.filter((u) => u.role === 'admin').length ?? 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Admin overview</h1>
        <p className="mt-1 text-sm text-zinc-500">Snapshot of the platform.</p>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Total users" value={totalUsers} />
        <Stat label="Admins" value={adminCount} />
        <Stat label="Credits in circulation" value={totalCredits} />
        <Stat label="Active packages" value={activePackages} />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link
          href="/admin/users"
          className="rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
        >
          <h2 className="text-sm font-semibold">Users</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Search, view balances, allocate credits, change roles.
          </p>
        </Link>
        <Link
          href="/admin/packages"
          className="rounded-lg border border-zinc-200 p-4 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:bg-zinc-900"
        >
          <h2 className="text-sm font-semibold">Credit packages</h2>
          <p className="mt-1 text-xs text-zinc-500">
            Create and edit the packages users can purchase.
          </p>
        </Link>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-3 dark:border-zinc-800">
      <p className="text-xs text-zinc-500">{label}</p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
    </div>
  );
}
