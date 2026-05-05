'use client';

import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { PUBLIC_ENV } from './env';

// Singleton — calling loadStripe more than once gives the same instance,
// but pinning it here is the documented pattern and avoids re-loading the
// 100KB script on every billing-page mount.
let cached: Promise<Stripe | null> | null = null;

export function getStripeJs(): Promise<Stripe | null> {
  if (cached) return cached;
  const key = PUBLIC_ENV.STRIPE_PUBLISHABLE_KEY;
  if (!key) {
    cached = Promise.resolve(null);
    return cached;
  }
  cached = loadStripe(key);
  return cached;
}
