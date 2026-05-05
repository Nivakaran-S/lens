import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { z } from 'zod';
import { requireAdmin, requireAuth, type AuthEnv } from '../auth.js';
import { addCredits, listUsers, setRole, getUser } from '../db/users.js';
import {
  createPackage,
  deactivatePackage,
  getPackage,
  listAllPackages,
  updatePackage,
} from '../db/packages.js';

export const adminRoute = new Hono<AuthEnv>();

// Order matters: requireAuth first to load user, then requireAdmin to gate.
adminRoute.use('*', requireAuth);
adminRoute.use('*', requireAdmin);

// ── Users ──────────────────────────────────────────────────────────────

adminRoute.get('/users', async (c) => {
  const search = c.req.query('search')?.trim() || undefined;
  const users = await listUsers({ search, limit: 100 });
  return c.json({ users });
});

const allocateSchema = z.object({
  delta: z.number().int(),
  note: z.string().max(500).optional(),
});

adminRoute.post('/users/:id/credits', async (c) => {
  const adminUser = c.get('user');
  const targetId = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = allocateSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: 'Invalid body' });

  const target = await getUser(targetId);
  if (!target) throw new HTTPException(404, { message: 'User not found' });

  const { delta, note } = parsed.data;
  if (delta === 0) {
    return c.json({ balance: target.credits });
  }

  // Use addCredits for any non-zero delta — it accepts negative deltas via
  // a separate code path in the helper. But our addCredits today only
  // handles positive deltas, so for negatives we fall back to deductCredits.
  if (delta > 0) {
    const result = await addCredits(targetId, delta, {
      source: 'admin_grant',
      admin_user_id: adminUser.id,
      note: note ?? null,
    });
    return c.json({ balance: result.balance });
  }

  // Negative delta — admin removing credits. Use the same atomic conditional
  // pattern but allow going to zero (not below). We import deductCredits.
  const { deductCredits } = await import('../db/users.js');
  const removeAmount = Math.abs(delta);
  // Cap removal at current balance so we never go negative.
  const cappedAmount = Math.min(removeAmount, target.credits);
  if (cappedAmount === 0) {
    return c.json({ balance: 0 });
  }
  const result = await deductCredits(targetId, cappedAmount, {
    source: 'admin_grant',
    admin_user_id: adminUser.id,
    note: note ?? null,
  });
  return c.json({ balance: result.balance });
});

const roleSchema = z.object({ role: z.enum(['user', 'admin']) });

adminRoute.post('/users/:id/role', async (c) => {
  const adminUser = c.get('user');
  const targetId = c.req.param('id');
  if (targetId === adminUser.id) {
    throw new HTTPException(400, { message: 'Cannot change your own role' });
  }
  const body = await c.req.json().catch(() => null);
  const parsed = roleSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: 'Invalid body' });

  const target = await getUser(targetId);
  if (!target) throw new HTTPException(404, { message: 'User not found' });

  await setRole(targetId, parsed.data.role);
  return c.json({ ok: true });
});

// ── Packages ───────────────────────────────────────────────────────────

adminRoute.get('/packages', async (c) => {
  const packages = await listAllPackages();
  return c.json({ packages });
});

const createPackageSchema = z.object({
  name: z.string().min(1).max(100),
  credits: z.number().int().positive().max(100_000),
  price_cents: z.number().int().nonnegative().max(10_000_000),
  currency: z.string().length(3).optional(),
  active: z.boolean().optional(),
});

adminRoute.post('/packages', async (c) => {
  const body = await c.req.json().catch(() => null);
  const parsed = createPackageSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: 'Invalid body' });
  const pkg = await createPackage(parsed.data);
  return c.json(pkg, 201);
});

const updatePackageSchema = createPackageSchema.partial();

adminRoute.patch('/packages/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => null);
  const parsed = updatePackageSchema.safeParse(body);
  if (!parsed.success) throw new HTTPException(400, { message: 'Invalid body' });
  const existing = await getPackage(id);
  if (!existing) throw new HTTPException(404, { message: 'Package not found' });
  const updated = await updatePackage(id, parsed.data);
  return c.json(updated);
});

adminRoute.delete('/packages/:id', async (c) => {
  const id = c.req.param('id');
  const existing = await getPackage(id);
  if (!existing) throw new HTTPException(404, { message: 'Package not found' });
  // Soft-delete so historical Stripe payments still resolve their package_id.
  await deactivatePackage(id);
  return c.body(null, 204);
});
