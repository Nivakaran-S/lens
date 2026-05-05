import { Hono } from 'hono';
import { requireAuth, type AuthEnv } from '../auth.js';
import { listActivePackages } from '../db/packages.js';

export const packagesRoute = new Hono<AuthEnv>();

packagesRoute.use('*', requireAuth);

/**
 * GET /api/packages — public list of active credit packages, used by the
 * /billing page to render purchase cards.
 *
 * Inactive packages are hidden from this list but still resolvable by id
 * (admin and historical-payment views), via the admin endpoints in admin.ts.
 */
packagesRoute.get('/', async (c) => {
  const packages = await listActivePackages();
  return c.json({ packages });
});
