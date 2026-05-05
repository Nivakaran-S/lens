'use client';

import {
  Suspense,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import {
  Elements,
  PaymentElement,
  useElements,
  useStripe,
} from '@stripe/react-stripe-js';
import type { StripeElementsOptions } from '@stripe/stripe-js';
import { ArrowLeft, Coins, Loader2, Lock } from 'lucide-react';
import { api } from '../../../../lib/api';
import { getStripeJs } from '../../../../lib/stripe';
import { PUBLIC_ENV } from '../../../../lib/env';

type PurchasePackage = {
  id: string;
  name: string;
  credits: number;
  price_cents: number;
  currency: string;
};

type PaymentIntentResponse = {
  clientSecret: string;
  paymentIntentId: string;
  amount: number;
  currency: string;
  package: PurchasePackage;
};

function PaymentForm({ pkg, amount, currency }: { pkg: PurchasePackage; amount: number; currency: string }) {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!stripe || !elements) return;
    setSubmitting(true);
    setError(null);

    const { error: confirmError } = await stripe.confirmPayment({
      elements,
      confirmParams: {
        return_url: `${window.location.origin}/billing/success`,
      },
    });

    // confirmPayment redirects on success. Reaching this point means the
    // user closed the 3DS modal, the card was declined, or the network
    // failed. Show the message and let them retry without re-creating
    // the intent.
    if (confirmError) {
      setError(confirmError.message ?? 'Payment failed. Please try again.');
      setSubmitting(false);
    }
  }

  const formattedAmount = (amount / 100).toLocaleString(undefined, {
    style: 'currency',
    currency: currency.toUpperCase(),
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="rounded-lg border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm font-medium">{pkg.name}</div>
            <div className="mt-0.5 text-xs text-zinc-500">
              {pkg.credits} credit{pkg.credits === 1 ? '' : 's'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-lg font-semibold tabular-nums">{formattedAmount}</div>
            <div className="text-xs text-zinc-500">one-off</div>
          </div>
        </div>
      </div>

      <div className="rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <PaymentElement options={{ layout: 'tabs' }} />
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      <button
        type="submit"
        disabled={!stripe || !elements || submitting}
        className="flex w-full items-center justify-center gap-2 rounded-md bg-zinc-900 px-4 py-2.5 text-sm font-medium text-white hover:bg-zinc-800 disabled:opacity-50 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-white"
      >
        {submitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" /> Processing…
          </>
        ) : (
          <>
            <Lock className="h-4 w-4" /> Pay {formattedAmount}
          </>
        )}
      </button>

      <p className="flex items-center justify-center gap-1.5 text-xs text-zinc-500">
        <Lock className="h-3 w-3" /> Payments processed securely by Stripe
      </p>
    </form>
  );
}

function CheckoutPageInner() {
  const router = useRouter();
  const search = useSearchParams();
  const packageId = search.get('pkg');

  const [data, setData] = useState<PaymentIntentResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!packageId) {
      router.replace('/billing');
      return;
    }
    if (!PUBLIC_ENV.STRIPE_PUBLISHABLE_KEY) {
      setError('Payments are not configured. NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is missing.');
      return;
    }
    let cancelled = false;
    api
      .createPaymentIntent(packageId)
      .then((r) => {
        if (!cancelled) setData(r);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      });
    return () => {
      cancelled = true;
    };
  }, [packageId, router]);

  // Memoise so Elements doesn't unmount on every render — clientSecret is
  // a one-shot per intent and re-creating Options would reset the form state.
  const options = useMemo<StripeElementsOptions | null>(() => {
    if (!data) return null;
    const isDarkMode =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches;
    return {
      clientSecret: data.clientSecret,
      appearance: {
        theme: isDarkMode ? 'night' : 'stripe',
        variables: { colorPrimary: '#18181b' },
      },
    };
  }, [data]);

  return (
    <div className="mx-auto max-w-md py-8">
      <div className="mb-6">
        <Link
          href="/billing"
          className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-200"
        >
          <ArrowLeft className="h-4 w-4" /> Back to packages
        </Link>
      </div>

      <div className="mb-6 flex items-center gap-2">
        <Coins className="h-5 w-5 text-amber-600" />
        <h1 className="text-2xl font-semibold tracking-tight">Checkout</h1>
      </div>

      {error && (
        <div className="rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900 dark:bg-red-950 dark:text-red-300">
          {error}
        </div>
      )}

      {!error && !data && (
        <div className="flex items-center gap-2 text-sm text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Preparing secure payment…
        </div>
      )}

      {data && options && (
        <Elements stripe={getStripeJs()} options={options}>
          <PaymentForm pkg={data.package} amount={data.amount} currency={data.currency} />
        </Elements>
      )}
    </div>
  );
}

export default function CheckoutPage() {
  return (
    <Suspense fallback={<p className="text-sm text-zinc-500">Loading…</p>}>
      <CheckoutPageInner />
    </Suspense>
  );
}
