'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { Check, Coins, Loader2 } from 'lucide-react';
import { api } from '../../../../lib/api';

function BillingSuccessInner() {
  const [credits, setCredits] = useState<number | null>(null);
  const [initialCredits, setInitialCredits] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tries, setTries] = useState(0);

  // Poll /api/me for ~10s waiting for the Stripe webhook to land. Show the
  // new balance once it changes from the initial reading.
  useEffect(() => {
    let cancelled = false;
    let cancel = false;

    async function tick() {
      try {
        const profile = await api.me();
        if (cancelled || cancel) return;
        if (initialCredits === null) {
          setInitialCredits(profile.credits);
        }
        setCredits(profile.credits);
      } catch (e) {
        if (!cancelled && !cancel) setError(e instanceof Error ? e.message : String(e));
      }
    }

    tick();
    const interval = setInterval(() => {
      setTries((t) => t + 1);
      tick();
    }, 1500);

    // Stop polling after 30s — webhook should land within ~5s normally.
    const stopAt = setTimeout(() => {
      cancel = true;
      clearInterval(interval);
    }, 30_000);

    return () => {
      cancelled = true;
      clearInterval(interval);
      clearTimeout(stopAt);
    };
  }, [initialCredits]);

  const updated = initialCredits !== null && credits !== null && credits > initialCredits;

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      {error ? (
        <div className="rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      ) : updated ? (
        <>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
            <Check className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Payment received</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Your credits have been added.
          </p>
          <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
            <Coins className="h-4 w-4 text-amber-600" />
            <span className="text-sm">
              Balance: <span className="font-mono font-semibold">{credits}</span>
            </span>
          </div>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/upload"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Run an analysis
            </Link>
            <Link
              href="/dashboard"
              className="rounded-md border border-zinc-300 px-4 py-2 text-sm hover:bg-zinc-50 dark:border-zinc-700 dark:hover:bg-zinc-900"
            >
              Dashboard
            </Link>
          </div>
        </>
      ) : (
        <>
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-zinc-400" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Confirming your payment…</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Waiting for Stripe to confirm. This usually takes a couple of seconds.
            {tries > 8 && (
              <>
                <br />
                Still waiting? Refresh the page or{' '}
                <Link href="/billing" className="underline">
                  return to billing
                </Link>
                .
              </>
            )}
          </p>
        </>
      )}
    </div>
  );
}

export default function BillingSuccessPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      <BillingSuccessInner />
    </Suspense>
  );
}
