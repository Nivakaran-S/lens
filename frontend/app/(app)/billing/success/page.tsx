'use client';

import { Suspense, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Check, Coins, Loader2, XCircle } from 'lucide-react';
import { api } from '../../../../lib/api';
import { useToast } from '../../../../components/Toaster';

/**
 * Stripe redirects here after a payment. URL carries:
 *   ?payment_intent=pi_…&payment_intent_client_secret=…&redirect_status=succeeded|failed|requires_action
 *
 * `redirect_status` is the authoritative signal — we use it to decide success/
 * failure rather than polling credit balance (which races with the webhook and
 * doesn't tell us anything if the user already had credits).
 */
function BillingSuccessInner() {
  const router = useRouter();
  const search = useSearchParams();
  const toast = useToast();

  // Possible values per Stripe docs: 'succeeded' | 'failed' | 'requires_action'
  const redirectStatus = search.get('redirect_status');
  const isSuccess = redirectStatus === 'succeeded';
  const isFailure = redirectStatus === 'failed';

  const [credits, setCredits] = useState<number | null>(null);
  const toastedRef = useRef(false);
  const redirectedRef = useRef(false);

  // ── Success / failure flow ─────────────────────────────────────────
  // Fire one toast as soon as we land here, then auto-redirect:
  //   succeeded → /dashboard after 1.5s
  //   failed    → /billing  after 1.5s (with a 'failed' reason)
  //   anything else → stay on the page (rare; user came directly)
  useEffect(() => {
    if (toastedRef.current) return;
    if (isSuccess) {
      toastedRef.current = true;
      toast.push({
        kind: 'success',
        title: 'Payment successful',
        message: 'Credits will appear in your balance shortly.',
        durationMs: 6000,
      });
      const t = setTimeout(() => {
        if (!redirectedRef.current) {
          redirectedRef.current = true;
          router.replace('/dashboard');
        }
      }, 1500);
      return () => clearTimeout(t);
    }
    if (isFailure) {
      toastedRef.current = true;
      toast.push({
        kind: 'error',
        title: 'Payment failed',
        message: 'No credits were taken. Try again or use a different card.',
        durationMs: 8000,
      });
      const t = setTimeout(() => {
        if (!redirectedRef.current) {
          redirectedRef.current = true;
          router.replace('/billing?reason=payment_failed');
        }
      }, 1500);
      return () => clearTimeout(t);
    }
  }, [isSuccess, isFailure, router, toast]);

  // ── Background poll for the new balance ────────────────────────────
  // Optional but nice: show the updated number on the confirmation card
  // before the redirect fires. Doesn't block the redirect.
  useEffect(() => {
    let cancelled = false;
    let attempt = 0;

    async function tick() {
      try {
        const profile = await api.me();
        if (!cancelled) setCredits(profile.credits);
      } catch {
        // Ignore — the user is about to be redirected anyway.
      }
    }

    tick();
    const interval = setInterval(() => {
      attempt++;
      if (attempt > 6) clearInterval(interval); // ~10s of polling
      tick();
    }, 1500);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <div className="mx-auto max-w-md py-12 text-center">
      {isSuccess && (
        <>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-200">
            <Check className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Payment received</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Your credits are being added. Redirecting you to the dashboard…
          </p>
          {credits !== null && (
            <div className="mx-auto mt-6 inline-flex items-center gap-2 rounded-md border border-zinc-200 bg-zinc-50 px-4 py-2 dark:border-zinc-800 dark:bg-zinc-900">
              <Coins className="h-4 w-4 text-amber-600" />
              <span className="text-sm">
                Balance: <span className="font-mono font-semibold">{credits}</span>
              </span>
            </div>
          )}
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Go to dashboard
            </Link>
          </div>
        </>
      )}

      {isFailure && (
        <>
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-950 dark:text-red-200">
            <XCircle className="h-6 w-6" />
          </div>
          <h1 className="mt-4 text-2xl font-semibold tracking-tight">Payment failed</h1>
          <p className="mt-2 text-sm text-zinc-500">
            No credits were taken. Redirecting you back to billing…
          </p>
          <div className="mt-6 flex justify-center gap-3">
            <Link
              href="/billing"
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-800 dark:bg-zinc-100 dark:text-zinc-900"
            >
              Back to billing
            </Link>
          </div>
        </>
      )}

      {!isSuccess && !isFailure && (
        <>
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-zinc-400" />
          <h1 className="mt-4 text-xl font-semibold tracking-tight">Confirming your payment…</h1>
          <p className="mt-2 text-sm text-zinc-500">
            Awaiting Stripe&apos;s confirmation. If this takes more than a few seconds,{' '}
            <Link href="/dashboard" className="underline">
              go to the dashboard
            </Link>{' '}
            — credits will land automatically.
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
