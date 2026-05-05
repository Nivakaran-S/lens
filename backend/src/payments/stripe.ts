import Stripe from 'stripe';
import { env } from '../env.js';
import type { CreditPackageDoc } from '../db/mongo.js';
import type { UserDoc } from '../db/mongo.js';

let cached: Stripe | null = null;

export function getStripe(): Stripe {
  if (cached) return cached;
  const key = env().STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error('STRIPE_SECRET_KEY is not set');
  }
  cached = new Stripe(key, {
    // Pinned API version — bumping requires explicit testing of webhook
    // event shape and checkout response shape. The version pinned here
    // is the one shipped with the SDK at the time of this commit; do
    // not change without validating event-shape parsers below.
    apiVersion: '2025-02-24.acacia',
    typescript: true,
  });
  return cached;
}

/**
 * Create a Stripe Checkout Session for purchasing a credit package.
 * Uses inline `price_data` rather than a pre-created Stripe Price so the
 * admin can edit price/name in our DB without Stripe dashboard changes.
 *
 * `metadata.userId` and `metadata.packageId` are the only thread between
 * the checkout completion event and our credit-grant logic — they MUST
 * survive the round-trip via the webhook.
 */
export async function createCheckoutSession(args: {
  user: Pick<UserDoc, 'id' | 'email' | 'stripe_customer_id'>;
  package: Pick<CreditPackageDoc, 'id' | 'name' | 'credits' | 'price_cents' | 'currency'>;
  successUrl: string;
  cancelUrl: string;
}): Promise<{ sessionId: string; url: string; customerId: string | null }> {
  const stripe = getStripe();

  // Reuse the user's customer record across purchases — Stripe's dashboard
  // groups payments per customer so support is simpler.
  const customer = args.user.stripe_customer_id ?? undefined;
  const customerEmail = customer ? undefined : args.user.email;

  const session = await stripe.checkout.sessions.create({
    mode: 'payment',
    customer,
    customer_email: customerEmail,
    success_url: args.successUrl,
    cancel_url: args.cancelUrl,
    line_items: [
      {
        quantity: 1,
        price_data: {
          currency: args.package.currency,
          unit_amount: args.package.price_cents,
          product_data: {
            name: args.package.name,
            description: `${args.package.credits} Lens credit${args.package.credits === 1 ? '' : 's'}`,
          },
        },
      },
    ],
    metadata: {
      userId: args.user.id,
      packageId: args.package.id,
      credits: String(args.package.credits),
    },
    payment_intent_data: {
      metadata: {
        userId: args.user.id,
        packageId: args.package.id,
        credits: String(args.package.credits),
      },
    },
  });

  if (!session.url) throw new Error('Stripe did not return a checkout URL');
  return {
    sessionId: session.id,
    url: session.url,
    customerId: typeof session.customer === 'string' ? session.customer : null,
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
