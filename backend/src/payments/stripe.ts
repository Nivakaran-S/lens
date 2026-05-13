import Stripe from 'stripe';
import { env } from '../env.js';
import type { CreditPackageDoc, UserDoc } from '../db/schema.js';

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = env().STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  cached = new Stripe(key, {
    // Pinned API version — bumping requires explicit testing of webhook
    // event shape. The version pinned here is the one shipped with the SDK
    // at the time of this commit; do not change without validating the
    // PaymentIntent + payment_intent.succeeded shapes used below.
    apiVersion: '2025-02-24.acacia',
    typescript: true,
  });
  return cached;
}

/**
 * Create a Stripe PaymentIntent for purchasing a credit package. The client
 * secret is returned to the browser and consumed by Stripe Elements
 * (`<PaymentElement>`) to render the embedded payment form on our own page —
 * no redirect to a Stripe-hosted checkout.
 *
 * `metadata.userId` and `metadata.packageId` are the only thread between the
 * payment_intent.succeeded webhook and our credit-grant logic, so they MUST
 * survive the round-trip.
 */
export async function createPaymentIntent(args: {
  user: Pick<UserDoc, 'id' | 'email' | 'stripe_customer_id'>;
  package: Pick<CreditPackageDoc, 'id' | 'name' | 'credits' | 'price_cents' | 'currency'>;
}): Promise<{
  paymentIntentId: string;
  clientSecret: string;
  customerId: string | null;
  amount: number;
  currency: string;
}> {
  const stripe = getStripe();

  // Reuse the user's customer record across purchases so Stripe's dashboard
  // groups payments per customer (simpler support, single payment-method file).
  let customerId = args.user.stripe_customer_id;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: args.user.email,
      metadata: { userId: args.user.id },
    });
    customerId = customer.id;
  }

  const intent = await stripe.paymentIntents.create({
    amount: args.package.price_cents,
    currency: args.package.currency,
    customer: customerId,
    description: `${args.package.name} — ${args.package.credits} Check My Legals credit${
      args.package.credits === 1 ? '' : 's'
    }`,
    automatic_payment_methods: { enabled: true },
    metadata: {
      userId: args.user.id,
      packageId: args.package.id,
      credits: String(args.package.credits),
    },
  });

  if (!intent.client_secret) {
    throw new Error('Stripe did not return a client_secret for the PaymentIntent');
  }

  return {
    paymentIntentId: intent.id,
    clientSecret: intent.client_secret,
    customerId,
    amount: intent.amount,
    currency: intent.currency,
  };
}

/**
 * Verify a webhook payload using STRIPE_WEBHOOK_SECRET. Throws on
 * signature mismatch — caller should let the exception 4xx out.
 */
export function verifyWebhook(rawBody: string, signature: string): Stripe.Event {
  const stripe = getStripe();
  const secret = env().STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error('STRIPE_WEBHOOK_SECRET is not set');
  }
  return stripe.webhooks.constructEvent(rawBody, signature, secret);
}
