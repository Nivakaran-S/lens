'use client';

import { Suspense, useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Coins, Loader2 } from 'lucide-react';
import { api } from '../../../lib/api';
import { useUserProfile } from '../../../lib/useUserProfile';
import type { CreditPackage } from '../../../lib/types';

function BillingPageInner() {
  const search = useSearchParams();
  const reason = search.get('reason');
  const canceled = search.get('canceled') === '1';
  const { profile } = useUserProfile();
  const [packages, setPackages] = useState<CreditPackage[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .packages()
      .then((r) => {
        if (!cancelled) setPackages(r.packages);
      })
      .catch((e) => !cancelled && setError(e instanceof Error ? e.message : String(e)));
    return () => {
      cancelled = true;
    };
  }, []);

  async function buy(pkg: CreditPackage) {
    setBusy(pkg.id);
    try {
      const { url } = await api.createCheckout(pkg.id);
      window.location.href = url;
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
      setBusy(null);
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Buy credits</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Each pack analysis costs 1 credit. Failed analyses are refunded automatically.
        </p>
      </div>

      {profile && (
        <div className="flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm dark:border-zinc-800 dark:bg-zinc-900">
          <Coins className="h-4 w-4 text-amber-600" aria-hidden />
          <span>
            Current balance: <span className="font-mono font-semibold">{profile.credits}</span>{' '}
            credit{profile.credits === 1 ? '' : 's'}
          </span>
        </div>
      )}

      {reason === 'insufficient' && (
        <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200">
          You don&apos;t have enough credits to run that analysis. Pick a package below.
        </div>
      )}
      {canceled && (
        <div className="rounded-md border border-zinc-300 bg-zinc-50 p-3 text-sm text-zinc-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-300">
          Checkout canceled. No credits were added.
        </div>
      )}
      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {packages === null && <p className="text-sm text-zinc-500">Loading packages…</p>}

      {packages && packages.length === 0 && (
        <div className="rounded-lg border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500 dark:border-zinc-700">
          No credit packages are available right now. Please check back later.
        </div>
      )}

      {packages && packages.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {packages.map((pkg) => (
            <div
              key={pkg.id}
              className="flex flex-col justify-between rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
              <div>
                <h2 className="text-base font-semibold">{pkg.name}</h2>
                <p className="mt-2 text-3xl font-semibold tabular-nums">
                  {pkg.credits}
                  <span className="ml-1 text-sm font-normal text-zinc-500">credits</span>
                </p>
                <p className="mt-1 text-sm text-zinc-500">
                  {(pkg.price_cents / 100).toLocaleString(undefined, {
                    style: 'currency',
                    currency: pkg.currency.toUpperCase(),
                  })}{' '}
                  one-off
                </p>
              </div>
              <button
                onClick={() => buy(pkg)}
                disabled={busy !== null}
                className="mt-4 flex items-center justify-center gap-2 rounded-md bg-zinc-900 px-3 py-2 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900"
              >
                {busy === pkg.id ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Redirecting…
                  </>
                ) : (
                  'Buy'
                )}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function BillingPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      <BillingPageInner />
    </Suspense>
  );
}
