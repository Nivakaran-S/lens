'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Coins, Shield, ShieldOff } from 'lucide-react';
import { api } from '../../../lib/api';
import { useUserProfile } from '../../../lib/useUserProfile';
import type { AdminUser } from '../../../lib/types';

export default function AdminUsersPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useUserProfile();
  const [users, setUsers] = useState<AdminUser[] | null>(null);
  const [search, setSearch] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile) return;
    if (profile.role !== 'admin') {
      router.replace('/dashboard');
      return;
    }
    refresh('');
  }, [profile, profileLoading, router]);

  function refresh(q: string) {
    api
      .adminListUsers(q || undefined)
      .then((r) => setUsers(r.users))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }

  async function allocate(u: AdminUser) {
    const input = window.prompt(
      `Allocate credits to ${u.email}\nCurrent balance: ${u.credits}\n\nEnter signed delta (e.g. 50 to add, -10 to remove):`,
      '',
    );
    if (!input) return;
    const delta = parseInt(input, 10);
    if (Number.isNaN(delta)) {
      alert('Not a valid number.');
      return;
    }
    const note = window.prompt('Optional note (audit log):', '') || undefined;
    setBusy(u.id);
    try {
      const result = await api.adminAllocateCredits(u.id, delta, note);
      setUsers((prev) =>
        prev ? prev.map((x) => (x.id === u.id ? { ...x, credits: result.balance } : x)) : prev,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  async function toggleRole(u: AdminUser) {
    if (u.id === profile?.id) {
      alert("You can't change your own role.");
      return;
    }
    const next = u.role === 'admin' ? 'user' : 'admin';
    if (!window.confirm(`Set role of ${u.email} to '${next}'?`)) return;
    setBusy(u.id);
    try {
      await api.adminSetRole(u.id, next);
      setUsers((prev) =>
        prev ? prev.map((x) => (x.id === u.id ? { ...x, role: next } : x)) : prev,
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  }

  if (profileLoading || !profile || profile.role !== 'admin') {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Users</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {users === null ? 'Loading…' : `${users.length} users.`}
          </p>
        </div>
        <input
          type="search"
          value={search}
          placeholder="Search by email…"
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') refresh(search);
          }}
          className="rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
        />
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {users && (
        <div className="overflow-x-auto rounded-lg border border-zinc-200 dark:border-zinc-800">
          <table className="min-w-full text-sm">
            <thead className="bg-zinc-50 text-left text-xs uppercase tracking-wide text-zinc-500 dark:bg-zinc-900">
              <tr>
                <th className="px-4 py-2 font-medium">Email</th>
                <th className="px-4 py-2 font-medium">Role</th>
                <th className="px-4 py-2 font-medium">Credits</th>
                <th className="px-4 py-2 font-medium">Joined</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {users.map((u) => (
                <tr key={u.id}>
                  <td className="px-4 py-2 font-mono text-xs">{u.email}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                        u.role === 'admin'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                          : 'bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300'
                      }`}
                    >
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-2 tabular-nums">{u.credits}</td>
                  <td className="px-4 py-2 text-xs text-zinc-500">
                    {new Date(u.created_at).toLocaleDateString()}
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        onClick={() => allocate(u)}
                        disabled={busy === u.id}
                        className="flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                        title="Allocate credits"
                      >
                        <Coins className="h-3 w-3" /> Credits
                      </button>
                      <button
                        onClick={() => toggleRole(u)}
                        disabled={busy === u.id || u.id === profile.id}
                        className="flex items-center gap-1 rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                        title="Toggle role"
                      >
                        {u.role === 'admin' ? (
                          <>
                            <ShieldOff className="h-3 w-3" /> Demote
                          </>
                        ) : (
                          <>
                            <Shield className="h-3 w-3" /> Promote
                          </>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td className="px-4 py-6 text-center text-zinc-500" colSpan={5}>
                    No users found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
