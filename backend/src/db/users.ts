import { adminEmails, env } from '../env.js';
import { ensureIndexes, usersCollection, type UserDoc, type UserRole } from './mongo.js';
import { insertPayment, type PaymentInsert } from './payments.js';

const now = () => new Date().toISOString();

function strip(doc: UserDoc | null): UserDoc | null {
  if (!doc) return null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const copy = { ...(doc as any) };
  delete copy._id;
  return copy as UserDoc;
}

export async function getUser(id: string): Promise<UserDoc | null> {
  const users = await usersCollection();
  const doc = await users.findOne({ id });
  return strip(doc as UserDoc | null);
}

export async function getUserByEmail(email: string): Promise<UserDoc | null> {
  const users = await usersCollection();
  const doc = await users.findOne({ email: email.toLowerCase() });
  return strip(doc as UserDoc | null);
}

/**
 * Look up the user by Supabase auth id; create with default credits + role
 * derived from ADMIN_EMAILS if missing. Idempotent: concurrent first-touches
 * resolve to one row via the unique index on `id`.
 *
 * On creation, also writes a `signup_bonus` payment row so the audit log
 * tells us where the initial credits came from.
 */
export async function getOrCreateUser(args: { id: string; email?: string }): Promise<UserDoc> {
  const users = await usersCollection();
  await ensureIndexes();

  const existing = await users.findOne({ id: args.id });
  if (existing) return strip(existing as UserDoc) as UserDoc;

  const email = (args.email ?? `${args.id}@unknown.local`).toLowerCase();
  const role: UserRole = adminEmails().has(email) ? 'admin' : 'user';
  const credits = env().INITIAL_FREE_CREDITS;
  const ts = now();

  const doc: UserDoc = {
    id: args.id,
    email,
    role,
    credits,
    stripe_customer_id: null,
    created_at: ts,
    updated_at: ts,
  };

  try {
    await users.insertOne(doc);
  } catch (err: unknown) {
    // E11000 = duplicate key — another concurrent caller won. Re-fetch.
    const code = (err as { code?: number }).code;
    if (code === 11000) {
      const re = await users.findOne({ id: args.id });
      if (re) return strip(re as UserDoc) as UserDoc;
    }
    throw err;
  }

  // Audit-log the signup bonus.
  if (credits > 0) {
    await insertPayment({
      user_id: args.id,
      source: 'signup_bonus',
      credits_delta: credits,
      note: `Welcome bonus (${credits} free credits)`,
    });
  }

  return doc;
}

/**
 * Atomically deduct credits ONLY if the user has enough. Returns
 * { ok: true, balance } on success or { ok: false, balance } if insufficient.
 *
 * Concurrent calls race safely — Mongo's `$inc` with a `credits: { $gte: N }`
 * predicate either updates one document or doesn't.
 */
export async function deductCredits(
  userId: string,
  amount: number,
  payment: Omit<PaymentInsert, 'user_id' | 'credits_delta'>,
): Promise<{ ok: boolean; balance: number }> {
  if (amount <= 0) {
    const u = await getUser(userId);
    return { ok: true, balance: u?.credits ?? 0 };
  }

  const users = await usersCollection();
  const result = await users.findOneAndUpdate(
    { id: userId, credits: { $gte: amount } },
    { $inc: { credits: -amount }, $set: { updated_at: now() } },
    { returnDocument: 'after' },
  );

  if (!result) {
    const u = await getUser(userId);
    return { ok: false, balance: u?.credits ?? 0 };
  }

  await insertPayment({ ...payment, user_id: userId, credits_delta: -amount });
  return { ok: true, balance: (result as UserDoc).credits };
}

/**
 * Atomically grant credits (positive delta only). Logs a payment row.
 * Used by Stripe webhook, signup bonus, admin grants, refunds.
 */
export async function addCredits(
  userId: string,
  amount: number,
  payment: Omit<PaymentInsert, 'user_id' | 'credits_delta'>,
): Promise<{ balance: number }> {
  if (amount <= 0) {
    const u = await getUser(userId);
    return { balance: u?.credits ?? 0 };
  }

  const users = await usersCollection();
  const result = await users.findOneAndUpdate(
    { id: userId },
    { $inc: { credits: amount }, $set: { updated_at: now() } },
    { returnDocument: 'after' },
  );

  if (!result) throw new Error(`addCredits: user ${userId} not found`);

  await insertPayment({ ...payment, user_id: userId, credits_delta: amount });
  return { balance: (result as UserDoc).credits };
}

export async function setRole(userId: string, role: UserRole): Promise<void> {
  const users = await usersCollection();
  await users.updateOne({ id: userId }, { $set: { role, updated_at: now() } });
}

export async function setStripeCustomerId(userId: string, customerId: string): Promise<void> {
  const users = await usersCollection();
  await users.updateOne(
    { id: userId },
    { $set: { stripe_customer_id: customerId, updated_at: now() } },
  );
}

export type ListUsersOptions = {
  search?: string;
  limit?: number;
  cursor?: string; // created_at ISO string for keyset pagination
};

/**
 * List users for the admin panel. Filter on email substring if `search`
 * is given. Newest first.
 */
export async function listUsers(opts: ListUsersOptions = {}): Promise<UserDoc[]> {
  const users = await usersCollection();
  const filter: Record<string, unknown> = {};
  if (opts.search) {
    filter.email = { $regex: escapeRegex(opts.search.toLowerCase()), $options: 'i' };
  }
  if (opts.cursor) {
    filter.created_at = { $lt: opts.cursor };
  }
  const cursor = users
    .find(filter)
    .sort({ created_at: -1 })
    .limit(Math.min(opts.limit ?? 50, 500));
  const out: UserDoc[] = [];
  for await (const doc of cursor) {
    out.push(strip(doc as UserDoc) as UserDoc);
  }
  return out;
}

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
