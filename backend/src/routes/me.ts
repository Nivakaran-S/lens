import { Hono } from 'hono';
import { requireAuth, type AuthEnv } from '../auth.js';
import { getUser } from '../db/users.js';

export const meRoute = new Hono<AuthEnv>();

meRoute.use('*', requireAuth);

/**
 * GET /api/me — returns the caller's profile, including the live credits
 * balance from MongoDB. Frontend uses this to populate the AppHeader pill
 * and on the /billing/success page to poll until the webhook lands.
 *
 * requireAuth has already provisioned the user row via getOrCreateUser,
 * but we re-fetch from Mongo here so credits reflect concurrent updates
 * (e.g. a webhook just credited the account between auth and now).
 */
meRoute.get('/', async (c) => {
  const auth = c.get('user');
  const fresh = await getUser(auth.id);
  return c.json({
    id: auth.id,
    email: auth.email,
    role: fresh?.role ?? auth.role,
    credits: fresh?.credits ?? auth.credits,
  });
});
