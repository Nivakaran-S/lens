'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Trash2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { useUserProfile } from '../../../lib/useUserProfile';
import type { CreditPackage } from '../../../lib/types';

type Editing = {
  id?: string;
  name: string;
  credits: string;
  price_major: string; // user enters major units (e.g. "9.99"), stored as cents
  currency: string;
  active: boolean;
};

const blank = (): Editing => ({
  name: '',
  credits: '',
  price_major: '',
  currency: 'gbp',
  active: true,
});

export default function AdminPackagesPage() {
  const router = useRouter();
  const { profile, loading: profileLoading } = useUserProfile();
  const [packages, setPackages] = useState<CreditPackage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (profileLoading) return;
    if (!profile) return;
    if (profile.role !== 'admin') {
      router.replace('/dashboard');
      return;
    }
    refresh();
  }, [profile, profileLoading, router]);

  function refresh() {
    api
      .adminListPackages()
      .then((r) => setPackages(r.packages))
      .catch((e) => setError(e instanceof Error ? e.message : String(e)));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!editing) return;
    const credits = parseInt(editing.credits, 10);
    const priceMajor = parseFloat(editing.price_major);
    if (Number.isNaN(credits) || credits <= 0) return alert('Credits must be a positive integer');
    if (Number.isNaN(priceMajor) || priceMajor < 0) return alert('Price must be ≥ 0');
    const price_cents = Math.round(priceMajor * 100);
    setBusy(true);
    try {
      if (editing.id) {
        await api.adminUpdatePackage(editing.id, {
          name: editing.name,
          credits,
          price_cents,
          currency: editing.currency.toLowerCase(),
          active: editing.active,
        });
      } else {
        await api.adminCreatePackage({
          name: editing.name,
          credits,
          price_cents,
          currency: editing.currency.toLowerCase(),
          active: editing.active,
        });
      }
      setEditing(null);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    if (!window.confirm('Delete this package? Existing purchases will keep working.')) return;
    setBusy(true);
    try {
      await api.adminDeletePackage(id);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  if (profileLoading || !profile || profile.role !== 'admin') {
    return <p className="text-sm text-zinc-500">Loading…</p>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Credit packages</h1>
          <p className="mt-1 text-sm text-zinc-500">
            What users see on /billing. Inactive packages are hidden from purchase but still
            resolve for historical receipts.
          </p>
        </div>
        <button
          onClick={() => setEditing(blank())}
          className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
        >
          Create package
        </button>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {packages && (
        <ul className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 dark:divide-zinc-800 dark:border-zinc-800">
          {packages.length === 0 && (
            <li className="p-6 text-center text-sm text-zinc-500">No packages yet. Create one.</li>
          )}
          {packages.map((p) => (
            <li key={p.id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0">
                <p className="text-sm font-medium">
                  {p.name}{' '}
                  {!p.active && (
                    <span className="ml-1 rounded-full bg-zinc-200 px-1.5 py-0.5 text-[10px] font-semibold uppercase text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300">
                      inactive
                    </span>
                  )}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">
                  {p.credits} credits ·{' '}
                  {(p.price_cents / 100).toLocaleString(undefined, {
                    style: 'currency',
                    currency: p.currency.toUpperCase(),
                  })}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() =>
                    setEditing({
                      id: p.id,
                      name: p.name,
                      credits: String(p.credits),
                      price_major: (p.price_cents / 100).toFixed(2),
                      currency: p.currency,
                      active: p.active,
                    })
                  }
                  className="rounded-md border border-zinc-300 px-2 py-1 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
                >
                  Edit
                </button>
                <button
                  onClick={() => remove(p.id)}
                  className="flex items-center gap-1 rounded-md border border-red-300 px-2 py-1 text-xs text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-300 dark:hover:bg-red-950/40"
                >
                  <Trash2 className="h-3 w-3" /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <form
            onSubmit={save}
            className="w-full max-w-md space-y-3 rounded-lg border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-950"
          >
            <h2 className="text-lg font-semibold">{editing.id ? 'Edit package' : 'New package'}</h2>
            <Field label="Name">
              <input
                type="text"
                required
                value={editing.name}
                onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Credits">
                <input
                  type="number"
                  required
                  min={1}
                  value={editing.credits}
                  onChange={(e) => setEditing({ ...editing, credits: e.target.value })}
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </Field>
              <Field label="Price (major units)">
                <input
                  type="number"
                  required
                  min={0}
                  step="0.01"
                  value={editing.price_major}
                  onChange={(e) => setEditing({ ...editing, price_major: e.target.value })}
                  className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm dark:border-zinc-700 dark:bg-zinc-900"
                />
              </Field>
            </div>
            <Field label="Currency">
              <input
                type="text"
                required
                maxLength={3}
                value={editing.currency}
                onChange={(e) => setEditing({ ...editing, currency: e.target.value })}
                className="w-full rounded-md border border-zinc-300 bg-white px-3 py-1.5 text-sm uppercase dark:border-zinc-700 dark:bg-zinc-900"
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
              />
              Active (visible on /billing)
            </label>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditing(null)}
                className="rounded-md border border-zinc-300 px-3 py-1.5 text-xs hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={busy}
                className="rounded-md bg-zinc-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {busy ? 'Saving…' : 'Save'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-medium text-zinc-700 dark:text-zinc-300">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
