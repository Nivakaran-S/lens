import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth, type AuthEnv } from '../auth.js';
import { getPackage } from '../db/packages.js';
import { getUser, setStripeCustomerId } from '../db/users.js';
import { createPaymentIntent } from '../payments/stripe.js';

export const checkoutRoute = new Hono<AuthEnv>();

checkoutRoute.use('*', requireAuth);

const bodySchema = z.object({ packageId: z.string().min(1) });

/**
 * POST /api/payment-intent — body: { packageId }
 *
 * Creates a Stripe PaymentIntent for the chosen package and returns the
 * client_secret. The frontend uses Stripe Elements (`<PaymentElement>`) to
 * render the payment form on our own page; we never redirect to a
 * Stripe-hosted checkout.
 *
 * Mounted at `/api/payment-intent` from app.ts.
 */
checkoutRoute.post('/', async (c) => {
  const auth = c.get('user');
  const body = await c.req.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: 'Invalid body' });

  const pkg = await getPackage(parsed.data.packageId);
  if (!pkg) throw new HTTPException(404, { message: 'Package not found' });
  if (!pkg.active) throw new HTTPException(400, { message: 'Package is no longer available' });
  if (pkg.price_cents <= 0) {
    throw new HTTPException(400, { message: 'Package is not purchasable (price <= 0)' });
  }

  const user = await getUser(auth.id);
  if (!user) throw new HTTPException(404, { message: 'User not found' });

  let intent;
  try {
    intent = await createPaymentIntent({ user, package: pkg });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('STRIPE_SECRET_KEY')) {
      throw new HTTPException(503, { message: 'Stripe is not configured on this server' });
    }
    throw new HTTPException(502, { message: `Stripe payment-intent failed: ${msg}` });
  }

  // Persist the Stripe customer id on first purchase so future intents
  // group under the same customer in Stripe's dashboard.
  if (intent.customerId && !user.stripe_customer_id) {
    await setStripeCustomerId(user.id, intent.customerId);
  }

  return c.json({
    clientSecret: intent.clientSecret,
    paymentIntentId: intent.paymentIntentId,
    amount: intent.amount,
    currency: intent.currency,
    package: {
      id: pkg.id,
      name: pkg.name,
      credits: pkg.credits,
      price_cents: pkg.price_cents,
      currency: pkg.currency,
    },
  });
});
