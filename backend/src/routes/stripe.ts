import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type Stripe from 'stripe';
import { addCredits } from '../db/users.js';
import { getPackage } from '../db/packages.js';
import { paymentForSession } from '../db/payments.js';
import { verifyWebhook } from '../payments/stripe.js';
import { logger as fallbackLogger, type Logger } from '../util/log.js';

export const stripeRoute = new Hono();

/**
 * POST /api/stripe/webhook
 *
 * Receives Stripe webhooks. The signature header must be verified BEFORE we
 * trust the body. Idempotency is enforced via the unique-sparse index on
 * payments.stripe_session_id: if the same session_id arrives twice, the
 * second insert hits E11000 and we treat it as already-processed.
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

  if (event.type !== 'checkout.session.completed') {
    // Other events (payment_intent.created, etc.) — ack and ignore.
    return c.json({ received: true, ignored: event.type });
  }

  const session = event.data.object as Stripe.Checkout.Session;
  const userId = session.metadata?.userId;
  const packageId = session.metadata?.packageId;
  const sessionId = session.id;

  if (!userId || !packageId || !sessionId) {
    log.error('webhook: missing required metadata', {
      userId,
      packageId,
      sessionId,
    });
    // Return 200 so Stripe doesn't retry — a malformed metadata payload
    // is our bug to fix at checkout creation, not something retries help.
    return c.json({ received: true, error: 'missing metadata' });
  }

  // Idempotency check: if we already credited this session, do nothing.
  const existing = await paymentForSession(sessionId);
  if (existing) {
    log.info(`webhook: session ${sessionId} already processed; skipping`);
    return c.json({ received: true, idempotent: true });
  }

  const pkg = await getPackage(packageId);
  if (!pkg) {
    log.error(`webhook: package ${packageId} not found`);
    return c.json({ received: true, error: 'package not found' });
  }

  const credits = pkg.credits;
  const amountTotal = session.amount_total ?? pkg.price_cents;
  const currency = session.currency ?? pkg.currency;

  try {
    const result = await addCredits(userId, credits, {
      package_id: packageId,
      source: 'stripe',
      amount_cents: amountTotal,
      currency,
      stripe_session_id: sessionId,
      note: `Stripe checkout ${sessionId}`,
    });
    log.info(
      `webhook: granted ${credits} credits to ${userId.slice(0, 8)}; balance=${result.balance}`,
    );
    return c.json({ received: true, balance: result.balance });
  } catch (err) {
    // Concurrent webhook retry won the race — another insert with the
    // same stripe_session_id already happened. Treat as success.
    if (err && typeof err === 'object' && 'code' in err && (err as { code: number }).code === 11000) {
      log.info(`webhook: race lost (E11000) — already credited; skipping`);
      return c.json({ received: true, idempotent: true });
    }
    log.error('webhook: failed to credit user', {
      error: err instanceof Error ? err.message : String(err),
    });
    // Return 500 so Stripe retries.
    throw new HTTPException(500, { message: 'Failed to credit user' });
  }
});
