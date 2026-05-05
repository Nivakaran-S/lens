import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAuth, type AuthEnv } from '../auth.js';
import { getPackage } from '../db/packages.js';
import { getUser, setStripeCustomerId } from '../db/users.js';
import { env } from '../env.js';
import { createCheckoutSession } from '../payments/stripe.js';

export const checkoutRoute = new Hono<AuthEnv>();

checkoutRoute.use('*', requireAuth);

const bodySchema = z.object({ packageId: z.string().min(1) });

/**
 * POST /api/checkout — body: { packageId }
 * Creates a Stripe Checkout Session for the chosen package and returns the
 * hosted-checkout URL. The frontend redirects the browser to that URL.
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

  const frontend = env().FRONTEND_URL.replace(/\/+$/, '');

  let session;
  try {
    session = await createCheckoutSession({
      user,
      package: pkg,
      successUrl: `${frontend}/billing/success?session_id={CHECKOUT_SESSION_ID}`,
      cancelUrl: `${frontend}/billing?canceled=1`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('STRIPE_SECRET_KEY')) {
      throw new HTTPException(503, { message: 'Stripe is not configured on this server' });
    }
    throw new HTTPException(502, { message: `Stripe checkout failed: ${msg}` });
  }

  // Persist the Stripe customer id on first purchase so future checkouts
  // group under the same customer in Stripe's dashboard.
  if (session.customerId && !user.stripe_customer_id) {
    await setStripeCustomerId(user.id, session.customerId);
  }

  return c.json({ url: session.url });
});
