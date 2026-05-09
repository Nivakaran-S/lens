import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type Stripe from 'stripe';
import { addCredits } from '../db/users.js';
import { getPackage } from '../db/packages.js';
import { paymentForIntent } from '../db/payments.js';
import { isUniqueViolation } from '../db/client.js';
import { verifyWebhook } from '../payments/stripe.js';
import { logger as fallbackLogger, type Logger } from '../util/log.js';

export const stripeRoute = new Hono();

/**
 * POST /api/stripe/webhook
 *
 * Receives Stripe webhooks. The signature header must be verified BEFORE we
 * trust the body. Idempotency is enforced via the unique partial index on
 * payments.stripe_payment_intent_id: if the same intent id arrives twice,
 * the second insert hits E11000 and we treat it as already-processed.
 *
 * Embedded checkout uses PaymentIntents (not Checkout Sessions), so we
 * listen for `payment_intent.succeeded`. Other events are acked and
 * ignored — Stripe still expects 2xx so it stops retrying.
 *
 * NOT auth-protected by Supabase JWT — Stripe doesn't have one. The
 * webhook secret IS the auth.
 */
stripeRoute.post('/webhook', async (c) => {
  const log =
    (c.get('log' as never) as Logger | undefined) ?? fallbackLogger('stripe-webhook');

  const sig = c.req.header('stripe-signature');
  if (!sig) {
    log.warn('webhook: missing stripe-signature header');
    throw new HTTPException(400, { message: 'Missing stripe-signature header' });
  }

  const rawBody = await c.req.text();

  let event: Stripe.Event;
  try {
    event = verifyWebhook(rawBody, sig);
  } catch (err) {
    log.warn('webhook: signature verification failed', {
      error: err instanceof Error ? err.message : String(err),
    });
    throw new HTTPException(400, { message: 'Invalid signature' });
  }

  log.info(`webhook: ${event.type} id=${event.id}`);

  if (event.type !== 'payment_intent.succeeded') {
    // payment_intent.created/processing, charge.*, etc. — ack and ignore.
    return c.json({ received: true, ignored: event.type });
  }

  const intent = event.data.object as Stripe.PaymentIntent;
  const userId = intent.metadata?.userId;
  const packageId = intent.metadata?.packageId;
  const intentId = intent.id;

  if (!userId || !packageId || !intentId) {
    log.error('webhook: missing required metadata', {
      userId,
      packageId,
      intentId,
    });
    // Return 200 so Stripe doesn't retry — malformed metadata is our bug
    // at intent-creation time, not something retries help.
    return c.json({ received: true, error: 'missing metadata' });
  }

  // Idempotency check: if we already credited this intent, do nothing.
  const existing = await paymentForIntent(intentId);
  if (existing) {
    log.info(`webhook: intent ${intentId} already processed; skipping`);
    return c.json({ received: true, idempotent: true });
  }

  const pkg = await getPackage(packageId);
  if (!pkg) {
    log.error(`webhook: package ${packageId} not found`);
    return c.json({ received: true, error: 'package not found' });
  }

  const credits = pkg.credits;
  const amountTotal = intent.amount_received ?? intent.amount ?? pkg.price_cents;
  const currency = intent.currency ?? pkg.currency;

  try {
    const result = await addCredits(userId, credits, {
      package_id: packageId,
      source: 'stripe',
      amount_cents: amountTotal,
      currency,
      stripe_payment_intent_id: intentId,
      note: `Stripe payment ${intentId}`,
    });
    log.info(
      `webhook: granted ${credits} credits to ${userId.slice(0, 8)}; balance=${result.balance}`,
    );
    return c.json({ received: true, balance: result.balance });
  } catch (err) {
    // Concurrent webhook retry won the race — another insert with the
    // same payment_intent_id already happened. Treat as success.
    if (isUniqueViolation(err, 'payments_stripe_intent_unique')) {
      log.info(`webhook: race lost (23505) — already credited; skipping`);
      return c.json({ received: true, idempotent: true });
    }
    log.error('webhook: failed to credit user', {
      error: err instanceof Error ? err.message : String(err),
    });
    // Return 500 so Stripe retries.
    throw new HTTPException(500, { message: 'Failed to credit user' });
  }
});
